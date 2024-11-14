'use strict';

const path = require('path');
require('dotenv').config({path: path.join(__dirname, './env.sh')});
const th = require('../../common-test/test-helper.js');
const lambdaLocal = require("lambda-local");
// const dayjs = require('dayjs');
// const utc = require('dayjs/plugin/utc');
// const timezone = require('dayjs/plugin/timezone');
// const customParseFormat = require('dayjs/plugin/customParseFormat');
// dayjs.extend(utc);
// dayjs.extend(timezone);
// dayjs.extend(customParseFormat);
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
const dynClient = new DynamoDBClient({region: process.env.REGION, endpoint: process.env.DYNAMO_ENDPOINT, apiVersion: "2012-08-10"});
const docClient = DynamoDBDocumentClient.from(dynClient);

const validConditions = require('../api.js').validConditions;

const user = {
    userId: 'abc123',
    email: 'someone@example.com',
    name: 'Kim',
    phone_number: '012-345-6789',
    sub: 'abc123'
};

describe("API call for user", () => {

    beforeAll(async () => {
        await th.dynamo.createTable(process.env.USERS_TABLE, 
            [{AttributeName: 'userId', KeyType: 'HASH'}], 
            [{AttributeName: 'userId', AttributeType: 'S'}]
        );
        const params = {
            TableName: process.env.USERS_TABLE,
            Item: user
        };
        await docClient.send(new PutCommand(params));
    });

    test("GET should succeed", async() => {
        const result = await runLambda('/self', 'GET', {requestContext: {authorizer: {jwt: {claims: {sub: user.userId}}}}});
        for (const field in ['email', 'name', 'phone_number', 'sub']) {
            expect(result[field]).toBe(user[field]);
        }
    });

    test("PUT should succeed", async() => {
        const update = {name: 'Tom'};
        const updateJson = JSON.stringify(update);
        const result = await runLambda('/self', 'PUT', {
            body: updateJson,
            requestContext: {authorizer: {jwt: {claims: {sub: user.userId}}}}
        });
        expect(result.statusCode).toBe(200);
        const userRec = await fetchUser(user.userId);
        expect(userRec.name).toBe(update.name);
    });

    afterAll(async () => {
        await th.dynamo.deleteTable(process.env.USERS_TABLE);
    });
});

describe("Assignment to condition", () => {

    beforeEach(async() => {
        await th.dynamo.createTable(process.env.USERS_TABLE, 
            [{AttributeName: 'userId', KeyType: 'HASH'}], 
            [{AttributeName: 'userId', AttributeType: 'S'}]
        );
    });

    test("should work when there are zero users assigned to condition", async () => {
        const newUser = { userId: 'def459', condition: {assignedSex: 'male', race: 'black'}};
        await putUsers([newUser]);
        const result = await runLambda('/self/condition', 'POST', {
            requestContext: {authorizer: {jwt: {claims: {sub: newUser.userId}}}}
        });
        expect(result.statusCode).toBe(200);
        const resp = JSON.parse(result.body);
        expect(validConditions).toContain(resp.condition);

        const userRec = await fetchUser(newUser.userId);
        expect(userRec.condition.assigned).toBe(resp.condition);
    });

    test("should not delete other condition information", async () => {
        const newUser = { userId: 'def459', condition: {assignedSex: 'male', race: 'black'}};
        await putUsers([newUser]);
        const origUser = await fetchUser(newUser.userId);
        const result = await runLambda('/self/condition', 'POST', {
            requestContext: {authorizer: {jwt: {claims: {sub: newUser.userId}}}}
        });
        expect(result.statusCode).toBe(200);
        const resp = JSON.parse(result.body);
        expect(validConditions).toContain(resp.condition);

        const userRec = await fetchUser(newUser.userId);
        expect(userRec.condition.assigned).toBe(resp.condition);
        expect(userRec.condition.assignedSex).toBe(origUser.condition.assignedSex);
        expect(userRec.condition.race).toBe(origUser.condition.race);
    });

    test("should work when there is one user assigned to condition", async () => {
        const existingUser = { userId: 'ijlfae234', condition: {assignedSex: 'female', race: 'white', assigned: validConditions[0]} };
        const newUser = { userId: 'def459', condition: {assignedSex: 'female', race: 'white'}};
        await putUsers([existingUser, newUser]);
        const result = await runLambda('/self/condition', 'POST', {
            requestContext: {authorizer: {jwt: {claims: {sub: newUser.userId}}}}
        });
        expect(result.statusCode).toBe(200);
        const resp = JSON.parse(result.body);
        expect(validConditions).toContain(resp.condition);

        const userRec = await fetchUser(newUser.userId);
        expect(userRec.condition.assigned).toBe(resp.condition);
    });

    test("should assign to the condition that has the minimum number of users of the same sex and race", async () => {
        const conditions = ['A', 'A', 'B'];
        const existingUsers = [];
        const race = 'black';
        const sex = 'female';
        for (let i = 0; i < conditions.length; i++) {
            const cond = conditions[i];
            const userId = `${cond}${i}`;
            existingUsers.push({userId: userId, condition: { assignedSex: sex, race: race, assigned: cond}});
        }
        const newUser = {userId: 'fjalf29380', condition: { assignedSex: sex, race: race }};
        await putUsers([...existingUsers, newUser]);

        const result = await runLambda('/self/condition', 'POST', {
            requestContext: {authorizer: {jwt: {claims: {sub: newUser.userId}}}}
        });
        expect(result.statusCode).toBe(200);
        const resp = JSON.parse(result.body);
        expect(validConditions).toContain(resp.condition);

        const potentialConds = getMinCountConds(conditions);
        expect(potentialConds).toContain(resp.condition);

    });

    test("should ignore dropped users when determining which condition has the minimum number of users", async () => {
        const conditions = ['A', 'A', 'B'];
        const existingUsers = [];
        const race = 'black';
        const sex = 'female';
        for (let i = 0; i < conditions.length; i++) {
            const cond = conditions[i];
            const userId = `${cond}${i}`;
            const user = {userId: userId, condition: { assignedSex: sex, race: race, assigned: cond}};
            if (cond == 'A') user.progress = { status: 'dropped'}
            existingUsers.push(user);
        }
        const newUser = {userId: 'fjalf29380', condition: { assignedSex: sex, race: race }};
        await putUsers([...existingUsers, newUser]);

        const result = await runLambda('/self/condition', 'POST', {
            requestContext: {authorizer: {jwt: {claims: {sub: newUser.userId}}}}
        });
        expect(result.statusCode).toBe(200);
        const resp = JSON.parse(result.body);
        expect(validConditions).toContain(resp.condition);

        const potentialConds = getMinCountConds(existingUsers.filter(eu => eu.progress?.status !== 'dropped').map(u => u.condition.assigned));
        expect(potentialConds.length).toBe(1);
        expect(potentialConds).toContain(resp.condition);
    });

    test("should ignore users of other races when determining which condition has the minimum number of users", async () => {
        const conditions = ['A', 'A', 'B'];
        const existingUsers = [];
        const sex = 'female';
        for (let i = 0; i < conditions.length; i++) {
            const cond = conditions[i];
            const userId = `${cond}${i}`;
            const user = {userId: userId, condition: { assignedSex: sex, assigned: cond}};
            const race = cond == 'A' ? 'black' : 'white';
            user.condition.race = race;
            existingUsers.push(user);
        }
        const newUser = {userId: 'fjalf29380', condition: { assignedSex: sex, race: 'white' }};
        await putUsers([...existingUsers, newUser]);

        const result = await runLambda('/self/condition', 'POST', {
            requestContext: {authorizer: {jwt: {claims: {sub: newUser.userId}}}}
        });
        expect(result.statusCode).toBe(200);
        const resp = JSON.parse(result.body);
        expect(validConditions).toContain(resp.condition);

        const potentialConds = getMinCountConds(existingUsers.filter(eu => eu.condition?.race == newUser.condition.race).map(u => u.condition.assigned));
        expect(potentialConds.length).toBe(1);
        expect(potentialConds).toContain(resp.condition);
    });

    test("should ignore users of other sexes when determining which condition has the minimum number of users", async () => {
        const conditions = ['A', 'A', 'B'];
        const existingUsers = [];
        const race = 'black';
        for (let i = 0; i < conditions.length; i++) {
            const cond = conditions[i];
            const userId = `${cond}${i}`;
            const user = {userId: userId, condition: { race: race, assigned: cond}};
            const sex = cond == 'A' ? 'male' : 'female';
            user.condition.assignedSex = sex;
            existingUsers.push(user);
        }
        const newUser = {userId: 'fjalf29380', condition: { assignedSex: 'female', race: race }};
        await putUsers([...existingUsers, newUser]);

        const result = await runLambda('/self/condition', 'POST', {
            requestContext: {authorizer: {jwt: {claims: {sub: newUser.userId}}}}
        });
        expect(result.statusCode).toBe(200);
        const resp = JSON.parse(result.body);
        expect(validConditions).toContain(resp.condition);

        const potentialConds = getMinCountConds(existingUsers.filter(eu => eu.condition?.assignedSex == newUser.condition.assignedSex).map(u => u.condition.assigned));
        expect(potentialConds.length).toBe(1);
        expect(potentialConds).toContain(resp.condition);
    });

    test("should ignore users who are not yet assigned to condition when determining which condition has the minimum number of users", async () => {
        const existingUsers = [];
        const race = 'black';
        const sex = 'female';
        for (let i = 0; i < 3; i++) {
            const user = {userId: `${i}`, condition: { race: race, assignedSex: sex}};
            if (i == 2) user.condition.assigned = 'A';
            existingUsers.push(user);
        }
        const newUser = {userId: 'fjalf29380', condition: { assignedSex: sex, race: race }};
        await putUsers([...existingUsers, newUser]);

        const result = await runLambda('/self/condition', 'POST', {
            requestContext: {authorizer: {jwt: {claims: {sub: newUser.userId}}}}
        });
        expect(result.statusCode).toBe(200);
        const resp = JSON.parse(result.body);
        expect(validConditions).toContain(resp.condition);

        const potentialConds = getMinCountConds(existingUsers.filter(eu => eu.condition.assigned !== undefined).map(u => u.condition.assigned));
        expect(potentialConds.length).toBe(1);
        expect(potentialConds).toContain(resp.condition);
    });

    test("should throw an error if an existing user has an invalid condition", async () => {
        const existingUser = {userId: 'jklajfe9834', condition: {assignedSex: 'male', race: 'white', assigned: 'foo'}};
        const newUser = {userId: 'jfajf3939', condition: {assignedSex: 'male', race: 'white'}};
        await putUsers([existingUser, newUser]);

        const result = await runLambda('/self/condition', 'POST', {
            requestContext: {authorizer: {jwt: {claims: {sub: newUser.userId}}}}
        });
        expect(result.statusCode).toBe(500);
        expect(result.body).toBe(`\"Unexpected condition ${existingUser.condition.assigned} found. User ${newUser.userId} cannot be assigned to condition.\"`);
    });

    test("should throw an error if the user to be assigned lacks sex information", async () => {
        const newUser = {userId: 'jfajf3939', condition: {race: 'white'}};
        await putUsers([newUser]);

        const result = await runLambda('/self/condition', 'POST', {
            requestContext: {authorizer: {jwt: {claims: {sub: newUser.userId}}}}
        });
        expect(result.statusCode).toBe(500);
        expect(result.body).toBe(`\"User ${newUser.userId} lacks either condition.assignedSex or condition.race; cannot be assigned to condition.\"`);
    });

    test("should throw an error if the user to be assigned lacks race information", async () => {
        const newUser = {userId: 'jfajf3939', condition: {assignedSex: 'female'}};
        await putUsers([newUser]);

        const result = await runLambda('/self/condition', 'POST', {
            requestContext: {authorizer: {jwt: {claims: {sub: newUser.userId}}}}
        });
        expect(result.statusCode).toBe(500);
        expect(result.body).toBe(`\"User ${newUser.userId} lacks either condition.assignedSex or condition.race; cannot be assigned to condition.\"`);
    });

    afterEach(async () => {
        await th.dynamo.deleteTable(process.env.USERS_TABLE);
    });
});

async function fetchUser(userId) {
    const params = {
        TableName: process.env.USERS_TABLE,
        Key: {
            userId: userId
        }
    };
    const userRec = await docClient.send(new GetCommand(params));
    return userRec.Item;
}

async function putUsers(users) {
    for (const u of users) {
        await docClient.send(new PutCommand({TableName: process.env.USERS_TABLE, Item: u}))
    }
}

function getMinCountConds(userConds) {
    const condCounts = Array(validConditions.length).fill(0);
        
    for (const cond of userConds) {
        condCounts[validConditions.indexOf(cond)] += 1;
    }

    // across all conditions, what is the lowest number of participants?
    const minCondCount = Math.min(...condCounts);

    // find all of the conditions that have the minCondCount
    const availableConds = [];
    condCounts.forEach((val, idx) => {
        if (val == minCondCount) availableConds.push(validConditions[idx])
    });
    return availableConds;
}

async function runLambda(httpPath, method, event) {
    Object.assign(event.requestContext,{ http: { path: httpPath, method: method } });
    return await lambdaLocal.execute({
        event: event,
        lambdaPath: path.join(__dirname, '../api.js'),
        lambdaHandler: 'handler',
        environment: {USERS_TABLE: process.env.USERS_TABLE},
        verboseLevel: 0
    });
}