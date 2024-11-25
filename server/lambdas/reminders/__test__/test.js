'use strict';

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { mockClient } from 'aws-sdk-client-mock'

const path = require('path');
require('dotenv').config({path: path.join(__dirname, './env.sh')});
import { statusTypes, maxSessionMinutes, stage2BreathingMinutes } from '../../../../common/types/types';
import { handler } from '../reminders';

const stage3User =  { userId: '123abc', email: 'nobody@example.com', phone: '+11112223333', phone_number_verified: true, progress: {status: statusTypes.STAGE_2_COMPLETE}};
const stage2User = { userId: '456def', email: 'somebody@example.com', phone: '+14445556666', phone_number_verified: true, progress: {status: statusTypes.STAGE_1_COMPLETE}};
const unverifiedPhoneUser = { userId: '678ghi', email:'badphone@example.com', phone: '+14445556666', phone_number_verified: false, progress: {status: statusTypes.STAGE_2_COMPLETE}};
const mockGetActiveUsers = jest.fn(() => [ stage3User, stage2User ]);
const mockSessionsForUser = jest.fn(() => []);

const mockSNSClient = mockClient(SNSClient);


jest.mock('db/db', () => {
    return jest.fn().mockImplementation(() => {
        return {
            getActiveUsers: () => mockGetActiveUsers(),
            sessionsForUser: (userId) => mockSessionsForUser(userId)
        };
    });
});

describe("reminders", () => {
    afterEach(() => {
        mockGetActiveUsers.mockClear();
        mockSessionsForUser.mockClear();
        mockSNSClient.resetHistory();
    });

    it("should throw an error if no reminderType is provided", async () => {
        await expect(() => handler({})).rejects.toEqual(Error("A reminderType of 'homeTraining' was expected, but 'undefined' was received."));
    });

    it("should throw an error if an unexpected reminderType is provided", async () => {
        await expect(() => handler({reminderType: 'make your bed'})).rejects.toEqual(Error("A reminderType of 'homeTraining' was expected, but 'make your bed' was received."));
    });

    it("should send an sms when the reminderType is correct and the participant has not trained", async () => {
        await handler({reminderType: 'homeTraining'});
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(2);
        expect(mockSNSClient.commandCalls(PublishCommand)[0].args[0].input.PhoneNumber).toBe(stage3User.phone_number);
        expect(mockSNSClient.commandCalls(PublishCommand)[1].args[0].input.PhoneNumber).toBe(stage2User.phone_number);
    });

    it("should not send a reminder to someone who has dropped out", async () => {
        const droppedUser = { userId: '123abc', email: 'nobody@example.com', progress: { status: statusTypes.DROPPED }, phone_number_verified: true,};
        mockGetActiveUsers.mockImplementationOnce(() => [droppedUser]);
        await handler({reminderType: 'homeTraining'});
        expect(mockGetActiveUsers).toHaveBeenCalledTimes(1);
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(0);
    });

    it("should not send a reminder to someone who has finished stage 3", async() => {
        const doneUser = { userId: 'abc123', email: 'nobody@example.com', progress: { status: statusTypes.COMPLETE}, phone_number_verified: true,};
        mockGetActiveUsers.mockImplementationOnce(() => [doneUser]);
        await handler({reminderType: 'homeTraining'});
        expect(mockGetActiveUsers).toHaveBeenCalledTimes(1);
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(0);
    });

    it("should not send a reminder to someone whose phone number has not been verified", async() => {
        mockGetActiveUsers.mockImplementationOnce(() => [unverifiedPhoneUser]);
        await handler({reminderType: 'homeTraining'});
        expect(mockGetActiveUsers).toHaveBeenCalledTimes(1);
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(0);
    });

    it("should not send a reminder to someone who has already done two full sessions today", async() => {
        const mockSessionsImpl = (userId) => {
            if (userId == stage3User.userId) {
                return [
                    {durationSeconds: maxSessionMinutes * 60},
                    {durationSeconds: (maxSessionMinutes / 2) * 60},
                    {durationSeconds: (maxSessionMinutes / 2) * 60}
                ]
            } else if (userId == stage2User.userId) {
                return [
                    {durationSeconds: stage2BreathingMinutes * 60},
                    {durationSeconds: stage2BreathingMinutes * 60}
                ]
            }
        };
        mockSessionsForUser
            .mockImplementationOnce(userId => mockSessionsImpl(userId))
            .mockImplementationOnce(userId => mockSessionsImpl(userId));
        await handler({reminderType: 'homeTraining'});
        expect(mockGetActiveUsers).toHaveBeenCalledTimes(1);
        expect(mockSessionsForUser).toHaveBeenCalledTimes(2);
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(0);
    });

    it("should send a reminder to someone who has done >0 minutes of training and less than two full stage 3 sessions today", async() => {
        const mockSessionsImpl = (userId) => {
            if (userId == stage3User.userId) {
                return [
                    {durationSeconds: maxSessionMinutes * 60}
                ]
            } else if (userId == stage2User.userId) {
                return [
                    {durationSeconds: stage2BreathingMinutes * 60}
                ]
            }
        };
        mockSessionsForUser
            .mockImplementationOnce(userId => mockSessionsImpl(userId))
            .mockImplementationOnce(userId => mockSessionsImpl(userId));
        await handler({reminderType: 'homeTraining'});
        expect(mockGetActiveUsers).toHaveBeenCalledTimes(1);
        expect(mockSessionsForUser).toHaveBeenCalledTimes(2);
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(2);
    });

});

