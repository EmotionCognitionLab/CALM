import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDocClient as docClient } from "../common/aws-clients.js";
const usersTable = process.env.USERS_TABLE;
const lumosAcctTable = process.env.LUMOS_ACCT_TABLE;
import Db from '../../../common/db/db.js';

exports.handler = async (event) => {
    const path = event.requestContext.http.path;
    const method = event.requestContext.http.method;
    if (path === "/self") {
        if (method === "GET") {
            return getSelf(event.requestContext.authorizer.jwt.claims.sub);
        }
        if (method === "PUT") {
            return updateSelf(event.requestContext.authorizer.jwt.claims.sub, JSON.parse(event.body));
        }
    }
    if (path === "/self/lumos" && method === "GET") {
        return getLumosCreds(event.requestContext.authorizer.jwt.claims.sub);
    }
    if (path.startsWith("/self/earnings") && method === "GET") {
        const earningsType = event.pathParameters.earningsType;
        return getEarnings(event.requestContext.authorizer.jwt.claims.sub, earningsType);
    }
    if (path === '/self/condition' && method === "POST") {
        return assignToCondition(event.requestContext.authorizer.jwt.claims.sub);
    }
    
    return errorResponse({statusCode: 400, message: `Unknown operation "${method} ${path}"`});
}

const getSelf = async (userId) => {
    try {
        const db = new Db({usersTable: usersTable});
        db.docClient = docClient;
        return await db.getUser(userId);
    //    return await getUserById(userId);
    } catch (err) {
        console.error(err);
        if (!(err instanceof HttpError)) {
            err = new HttpError(err.message);
        }
        return errorResponse(err);
    }
}

const updateSelf = async(userId, updates) => {
    try {
        if (!updates) {
            return errorResponse({statusCode: 400, message: "No updates found"});
        }

        const notModifiable = ['userId', 'createdAt', 'email', 'phone_number'];
        const allowedKeys = Object.keys(updates).filter(k => !notModifiable.includes(k));
        if (allowedKeys.length === 0) {
            return errorResponse({statusCode: 400, message: "No updates for allowed fields found"});
        }

        const expressionAttrVals = {};
        const expressionAttrNames = {};
        let updateExpression = 'set';
        for (const prop of allowedKeys) {
            const propName = `#${prop}`;
            const propVal = `:${prop}`
            expressionAttrNames[propName] = prop;
            expressionAttrVals[propVal] = updates[prop];
            updateExpression += ` ${propName} = ${propVal},`
        }
        updateExpression = updateExpression.slice(0, updateExpression.length - 1); // trim trailing comma
        const params = {
            TableName: usersTable,
            Key: { userId: userId },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttrNames,
            ExpressionAttributeValues: expressionAttrVals
        };
        await docClient.send(new UpdateCommand(params));
        return successResponse({msg: "update successful"});
    } catch (err) {
        console.error(err);
        if (!(err instanceof HttpError)) {
            err = new HttpError(err.message);
        }
        return errorResponse(err);
    }
}

const getEarnings = async (userId, earningsType = null) => {
    try {
        const db = new Db();
        db.docClient = docClient;
        return await db.earningsForUser(userId, earningsType);
    } catch (err) {
        console.error(err);
        if (!(err instanceof HttpError)) {
            err = new HttpError(err.message);
        }
        return errorResponse(err);
    }
}

const getLumosCreds = async (userId) => {
    try {
        // check to see if they already have lumos creds assigned

        const findCredsParams = {
            TableName: lumosAcctTable,
            FilterExpression: '#owner = :owner',
            ExpressionAttributeNames: { '#owner': 'owner' },
            ExpressionAttributeValues: { ':owner': userId },
            ConsistentRead: true
        };
        const credsResults = await docClient.send(new ScanCommand(findCredsParams));
        if (credsResults.Items.length === 1) {
            return credsResults.Items[0];
        }

        // no creds assigned; assign them an unused lumosity account
        const readParams = {
            TableName: lumosAcctTable,
            FilterExpression: 'attribute_not_exists(#owner)',
            ExpressionAttributeNames: { '#owner': 'owner' },
            ConsistentRead: true
        };
        const dynResults = await docClient.send(new ScanCommand(readParams));
        if (dynResults.Items.length < 1) {
            throw new Error(`No unused Lumosity accounts.`);
        }
        const acct = dynResults.Items[0];
        
        // and now mark the lumosity account we've selected as theirs
        const email = acct['email'];
        const writeParams = {
            TableName: lumosAcctTable,
            Key: {email: email},
            UpdateExpression: 'set #owner = :userId',
            ExpressionAttributeNames: { '#owner': 'owner' },
            ExpressionAttributeValues: { ':userId': userId },
            ConditionExpression: 'attribute_not_exists(#owner)'
        };
        await docClient.send(new UpdateCommand(writeParams));

        return acct;
    } catch (err) {
        console.error(err);
        if (!(err instanceof HttpError)) {
            err = new HttpError(err.message);
        }
        return errorResponse(err);
    }
}

const validConditions = ['A', 'B']; 
exports.validConditions = validConditions // exported for testing

const assignToCondition = async (userId) => {
    try {
        const db = new Db({usersTable: usersTable});
        db.docClient = docClient;
        const user = await db.getUser(userId);
        if (!user.condition?.race || !user.condition?.assignedSex) {
            throw new Error(`User ${userId} lacks either condition.assignedSex or condition.race; cannot be assigned to condition.`);
        }
        const userConds = await getActiveUserConditions(user.condition.race, user.condition.assignedSex);
        const condCounts = Array(validConditions.length).fill(0);
        
        for (const cond of userConds) {
            const idx = validConditions.indexOf(cond);
            if (idx == -1) throw new Error(`Unexpected condition ${cond} found. User ${userId} cannot be assigned to condition.`)
            condCounts[idx] += 1;
        }

        // across all conditions, what is the lowest number of participants?
        const minCondCount = Math.min(...condCounts);

        // find all of the conditions that have the minCondCount
        const availableConds = [];
        condCounts.forEach((val, idx) => {
            if (val == minCondCount) availableConds.push(idx)
        });

        // choose one of the available conditions at random
        const newCondIdx = availableConds[Math.floor(Math.random() * availableConds.length)];
        const newCond = validConditions[newCondIdx];

        const existingConditionData = user.condition;
        existingConditionData.assigned = newCond;
        await db.updateUser(userId, {condition: existingConditionData});
        return successResponse({condition: newCond});
    } catch (err) {
        console.error(err);
        if (!(err instanceof HttpError)) {
            err = new HttpError(err.message);
        }
        return errorResponse(err);
    }
}

/**
 * Does a full table scan. Use sparingly.
 */
async function getActiveUserConditions(race, sex) {
    let ExclusiveStartKey, dynResults
    const allResults = [];
    do {
        const params = {
            TableName: usersTable,
            ExclusiveStartKey,
            ProjectionExpression: "#condition",
            FilterExpression: `attribute_exists(#condition) and
            #condition.assignedSex = :sex and #condition.race = :race and
            attribute_exists(#condition.assigned) and
            ( attribute_not_exists(progress) or ( attribute_exists(progress) and 
            progress.#status <> :dropped ))`,
            ExpressionAttributeNames: {'#condition': 'condition', '#status': 'status'},
            ExpressionAttributeValues: {':dropped': 'dropped', ':race': race, ':sex': sex},
            ConsistentRead: true
        }
        dynResults = await docClient.send(new ScanCommand(params));
        ExclusiveStartKey = dynResults.LastEvaluatedKey
        allResults.push(...dynResults.Items);
    } while (dynResults.LastEvaluatedKey)

    return allResults.map(r => r.condition.assigned);
}

function successResponse(data) {
    return {
        "statusCode": 200,
        "body": JSON.stringify(data)
    }
}

function errorResponse(err) {
    const resp = {
        "body": JSON.stringify(err.message)
    } 

    if (err.statusCode) {
        resp["statusCode"] = err.statusCode;
    }

    if (err.code) {
        resp["headers"]["x-amzn-ErrorType"] = err.code;
        resp["body"] = `${err.code}: ${JSON.stringify(err.message)}`;
    }

    return resp;
}

class HttpError extends Error {
    constructor(message, statusCode=500) {
        super(message);
        this.name = "HttpError";
        this.statusCode = statusCode;
    }
}

