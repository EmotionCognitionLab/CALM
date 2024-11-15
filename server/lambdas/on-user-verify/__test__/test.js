'use strict';

const path = require('path');
require('dotenv').config({path: path.join(__dirname, './env.sh')});
const th = require('../../common-test/test-helper.js');
const { readFileSync } = require('fs');
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
const dynClient = new DynamoDBClient({region: process.env.REGION, endpoint: process.env.DYNAMO_ENDPOINT, apiVersion: "2012-08-10"});
const docClient = DynamoDBDocumentClient.from(dynClient);

const postConfirmationEventJson = readFileSync(path.join(__dirname, 'post-confirmation-event.json'));
const postConfirmationEvent = JSON.parse(postConfirmationEventJson);

const verified = require('../verified.js');

async function getConfirmedUser() {
    const params = {
        TableName: process.env.USERS_TABLE,
        Key: {
            userId: postConfirmationEvent.request.userAttributes.sub
        }
    };
    return await docClient.send(new GetCommand(params));
}

const user = {
    userId: 'abc123',
    email: 'someone@example.com',
    name: 'Kim',
    phone_number: '012-345-6789',
    phone_number_verified: false,
    sub: 'abc123'
};

async function putUser(user) {
    const params = {
        TableName: process.env.USERS_TABLE,
        Item: user
    };
    await docClient.send(new PutCommand(params));
}

describe("Testing with a valid post confirmation trigger event", () => {
    beforeEach(async () => {
        await th.dynamo.createTable(process.env.USERS_TABLE, 
            [{AttributeName: 'userId', KeyType: 'HASH'}], 
            [{AttributeName: 'userId', AttributeType: 'S'}]
        );
    });

    test("should succeed", async() => {
        const result = await verified.handler(postConfirmationEvent);
        expect(result.response).toBeDefined();
        const userRec = await getConfirmedUser();
        for (const field in ['email', 'given_name', 'family_name', 'phone_number', 'sub']) {
            expect(userRec.Item[field]).toBe(postConfirmationEvent.request.userAttributes[field]);
        }
        for (const field in ['race', 'sex']) {
            expect(userRec.Item['condition'][field]).toBe(postConfirmationEvent.request.userAttributes[`custom:${field}`]);
        }
        expect(userRec.Item['rcid']).toBe(postConfirmationEvent.request.userAttributes['profile']);
        const now = new Date().toISOString().substring(0, 18)
        expect(userRec.Item.createdAt.substring(0, 18)).toBe(now);
        expect(userRec.Item.phone_number_verified).toBeFalsy();
    });

    test("should do nothing if the trigger is not for a signup", async() => {
        const changePwTriggerEvent = JSON.parse(postConfirmationEventJson);
        changePwTriggerEvent.triggerSource = 'PostConfirmation_ConfirmForgotPassword';
        await verified.handler(changePwTriggerEvent);
        const params = {
            TableName: process.env.USERS_TABLE,
            Key: {
                userId: changePwTriggerEvent.request.userAttributes.sub
            }
        };
        const userRec = await docClient.send(new GetCommand(params));
        expect(userRec.Item).not.toBeDefined();
    });

    test("should set phone_number_verified to true if the user exists and phone_number_verified is false in dynamo", async () => {
        await putUser(user);
        const params = {
            TableName: process.env.USERS_TABLE,
            Key: {
                userId: user.userId
            }
        };
        const userRes = (await docClient.send(new GetCommand(params))).Item;
        expect(userRes.phone_number_verified).toBe(false);

        const phoneVerifiedEvent = JSON.parse(postConfirmationEventJson);
        phoneVerifiedEvent.request.userAttributes.sub = user.sub;
        phoneVerifiedEvent.request.userAttributes.phone_number_verified = 'true';
        const result = await verified.handler(phoneVerifiedEvent);
        expect(result.response).toBeDefined();
        const updatedUserRes = await docClient.send(new GetCommand(params));
        expect(updatedUserRes.Item.phone_number_verified).toBe(true);
    });

    afterEach(async () => {
        await th.dynamo.deleteTable(process.env.USERS_TABLE);
    });
});

