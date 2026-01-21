'use strict';

import { cwClient } from "../common/aws-clients.js";
import { CreateLogStreamCommand, DescribeLogStreamsCommand, PutLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs"; 

const logGroupName = process.env.CLOUDWATCH_LOG_GROUP;

exports.handler = async (event) => {
    const messages = JSON.parse(event.body);
    if (!Array.isArray(messages) || messages.length === 0) {
        return {
            statusCode: 400,
            body: JSON.stringify({message: "Malformed logging request"})
        };
    }
    const logResults = await log(messages);
    return logResults;
}

async function getLogStream() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const stream = `${year}-${month}-${day}`;

    // Check if log stream exists
    const describeCmd = new DescribeLogStreamsCommand({
        logGroupName: logGroupName,
        logStreamNamePrefix: stream
    });

    let describeResp = await cwClient.send(describeCmd);
    if (describeResp.logStreams.length === 0) {
        // Create log stream
        const createCmd = new CreateLogStreamCommand({
            logGroupName: logGroupName,
            logStreamName: stream
        });
        await cwClient.send(createCmd);
        describeResp = await cwClient.send(describeCmd);
    }
    
    return {
        streamName: stream,
        sequenceToken: describeResp.logStreams.length > 0 ? describeResp.logStreams[0].uploadSequenceToken : null
    };
}

async function log(entries) {
    try {
        const logStreamInfo = await getLogStream();
        if (!logStreamInfo.streamName) {
            return {
                statusCode: 500,
                body: JSON.stringify({message: "Error retrieving log stream information"})
            };
        }
        const putCmd = new PutLogEventsCommand({
            logGroupName: logGroupName,
            logStreamName: logStreamInfo.streamName,
            sequenceToken: logStreamInfo.sequenceToken,
            logEvents: entries
        });
        await cwClient.send(putCmd);
        return {
            statusCode: 200,
            body: JSON.stringify({message: "Log entry added successfully"})
        };
    } catch (error) {
        console.error("Error logging to CloudWatch Logs:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({message: "Error accessing CloudWatch Logs", error: error.message})
        };
    }
}