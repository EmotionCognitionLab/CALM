'use strict';

/**
 * Called by Cognito when a user verifies her account. Writes the 
 * user information from Cognito to Dynamo if it doesn't already exist.
 **/

const usersTable = process.env.USERS_TABLE;
import { dynamoDocClient as docClient } from '../common/aws-clients';
import { PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import Db from '../../../common/db/db.js';
const db = new Db({usersTable: usersTable});
db.docClient = docClient;

exports.handler = async (event) => {
    // make sure that we don't run this code when the user is 
    // going through the forgot password flow
    if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') return event;

    const userId = event.request.userAttributes["sub"];
    const user = await db.getUser(userId);
    if (user.userId) {
        if (!user.phone_number_verified && event.request.userAttributes["phone_number_verified"] === 'true') {
            await setPhoneNumberVerified(userId);
        }
        return event;
    }

    await writeUserToDynamo(event);
    return event;
};

async function setPhoneNumberVerified(userId) {
    const params = {
        TableName: usersTable,
        Key: {'userId': userId},
        UpdateExpression: 'set phone_number_verified = :true',
        ExpressionAttributeValues: {':true': true}
    };
    try {
        await docClient.send(new UpdateCommand(params));
    } catch (err) {
        console.log(err);
        throw new Error('Something went wrong. Please try again later.')  // NB this will be seen by the user
    }
}

async function writeUserToDynamo(event) {
    try {
        const userRec = await buildUserRecord(event);
        await docClient.send(new PutCommand(userRec));
    } catch (err) {
        console.log(err);
        throw new Error('Something went wrong. Please try again later.') // NB this will be seen by the user
    }
}

async function buildUserRecord(event) {
    const result = {
        TableName: usersTable,
        Item: {
            userId: event.request.userAttributes["sub"],
            given_name: event.request.userAttributes["given_name"],
            family_name: event.request.userAttributes["family_name"],
            email: event.request.userAttributes["email"],
            phone_number: event.request.userAttributes["phone_number"],
            phone_number_verified: event.request.userAttributes["phone_number_verified"] === 'true',
            rcid: event.request.userAttributes["profile"],
            condition: {
                race: event.request.userAttributes["custom:race"],
                assignedSex: event.request.userAttributes["custom:sex"].toLowerCase() == "female" ? "female" : "male",
                bornSex: event.request.userAttributes["custom:sex"]
            },
            createdAt: new Date().toISOString()
        }
    };
    return result;
}
