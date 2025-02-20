"use strict";

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb'
import { s3Client as s3 , dynamoDocClient as docClient } from '../common/aws-clients';
import { earningsAmounts, earningsTypes, statusTypes } from '../../../common/types/types';

const simpleParser = require('mailparser').simpleParser;
const dataForge = require('data-forge');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

const destBucket = process.env.DEST_BUCKET;
const destPrefix = process.env.DEST_PREFIX;
const lumosAcctTable = process.env.LUMOS_ACCT_TABLE;
const lumosPlaysTable = process.env.LUMOS_PLAYS_TABLE;
const earningsTable = process.env.EARNINGS_TABLE;
const usersTable = process.env.USERS_TABLE;
import Db from 'db/db.js';
import awsSettings from '../../../common/aws-settings.json';


const allGames = [
  'Memory Serves Web',
  'Color Match Web',
  'Raindrops Web',
  'Brain Shift Web',
  'Familiar Faces Web',
  'Ebb and Flow Web',
  'Lost in Migration Web',
];

export async function saveattachments(event) {
    // console.log('Received event:', JSON.stringify(event, null, 2));
    const record = event.Records[0];
    // Retrieve the email
    const request = {
      Bucket: record.s3.bucket.name,
      Key: record.s3.object.key,
    };
  
    try {
      const data = await s3.send(new GetObjectCommand(request))
      const email = await simpleParser(data.Body);
      if (!email.attachments || email.attachments.length === 0) {
        console.log(`Email '${email.subject}' (s3 key: ${record.s3.object.key}) had no attachments.`);
        return { status: 'success' };
      }
      for (const a of email.attachments) {
        const d = new Date();
        const dateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}-${d.getHours().toString().padStart(2, '0')}-${d.getMinutes().toString().padStart(2, '0')}-${d.getSeconds().toString().padStart(2, '0')}-${d.getMilliseconds().toString().padStart(3, '0')}`
        const destKey = `${destPrefix}/${dateStr}.${a.filename}`;
        const params = {
          Body: a.content.toString(),
          Bucket: destBucket,
          Key: destKey
        };
        await s3.send(new PutObjectCommand(params));
      }
      return { status: 'success' };
    } catch (err) {
      console.error(`Error trying to process email (s3 key: ${record.s3.object.key}).`)
      console.error(err, err.stack);
      throw(err);
    }
  };


export async function processreports(event) {
  
  const record = event.Records[0];
  // there are also daily engagement reports - we ignore those for now
  if (record && record.s3 && record.s3.object && record.s3.object.key && !record.s3.object.key.includes('game_result_report')) {
    console.log('Skipping - missing file key or file is not a game result report.')
    return { status: 'ignored', reason: 'Missing file key or file is not a game result report.'};
  }

  const request = {
    Bucket: record.s3.bucket.name,
    Key: record.s3.object.key,
  };
  const db = new Db({lumosTable: lumosAcctTable, usersTable: usersTable});
  db.docClient = docClient;

  try {
    // retrieve the report
    const data = await s3.send(new GetObjectCommand(request));

    // parse the data
    const playsData = lumosityGameResultsToPlaysByUserByGame(await data.Body.transformToString('utf-8'));
  
    // walk through each lumos user and get their userId and other info
    const emails = playsData.distinct(p => p.email).select(r => r.email).toArray();
    const email2UserInfoMap = {};
    for (const em of emails) {
      const userId = await getUserIdForLumosEmail(em);
      if (!userId) {
        console.error(`Error: no user account found for lumosity email ${em}.`);
        continue;
      }
     
      const lastPlay = userId ? await lastPlayDate(userId) : '1970-01-01 00:00:00';
      // TODO we have to process dropped and completed users b/c the Lumosity report is
      // one day delayed, so they might have Lumosity earnings the day after they drop
      // or complete. We should find a way to filter them out after that one day delay,
      // though, so that we're not needlessly processing hundreds of inactive users.
      const userInfo = userId ? await db.getUser(userId) : {};
      email2UserInfoMap[em] = {
        email: em,
        userId: userId,
        lastPlay: lastPlay,
        inStage2: userInfo.progress?.status == statusTypes.STAGE_1_COMPLETE,
        stage1StartedOn: userInfo.createdAt,
        user: userInfo
      };
    };

    // find all the users that have new lumos data and save it to dynamo
    const newPlayData = playsData.filter(r => 
      email2UserInfoMap[r.email] && 
      r.dateTime > email2UserInfoMap[r.email].lastPlay
    )
    .map(r => {
        r.userId = email2UserInfoMap[r.email].userId;
        return r;
      });
    if (newPlayData.count() > 0) await savePlaysData(newPlayData.toArray());

    // find all of the users who qualify for earnings
    // you must play all of [color match, lost in migration, familiar faces]
    // or all of [memory serves, brain shift, raindrops, ebb and flow] in a day to qualify

    // TODO if a previous report successfully wrote plays data and failed to write earnings data
    // the earnings data will never be written b/c newPlayData is only the plays since
    // the last recorded play. It would be better to re-filter playsData based on the last
    // recorded lumosity earnings date for each user and work with that.
    const withDays = newPlayData.generateSeries({date: r => r.dateTime.substring(0, 10)});
    const byUserByDay = withDays.groupBy(r => r.userId + r.date);
    const earningsQualified = byUserByDay.filter(g => {
      const gameNames = g.map(i => i.game).toArray();
      return ['Memory Serves Web', 'Brain Shift Web', 'Raindrops Web', 'Ebb and Flow Web'].every(n => gameNames.indexOf(n) != -1) ||
              ['Color Match Web', 'Lost in Migration Web', 'Familiar Faces Web'].every(n => gameNames.indexOf(n) != -1)
    });
    const earningsData = earningsQualified.map(r => ({userId: r.first().userId, date: r.first().date})).toArray();
    await saveEarnings(earningsData);

    // find all the users who have a new stage2Complete status and save that to dynamo
    // stage2Complete is true when a user has played each of the available games at least twice
    // AND
    // ( at least six days have elapsed since starting stage 1
    //   OR
    //   the user has played each of the available games at least three times )
    const stage2StatusMap = {};
    for (const email of Object.keys(email2UserInfoMap)) {
      const forEmail = playsData.filter(r => r.email === email);
      let twoPlays = true;
      let threePlays = true;
      let totalPlays = 0;
      for (const game of allGames) {
          const playsForGame = forEmail.where(r => r.game === game).count();
          totalPlays += playsForGame;
          if (playsForGame < 3) {
            threePlays = false;
          }
          if (playsForGame < 2) {
              twoPlays = false;
              break;
          }
      }
      stage2StatusMap[forEmail.first().email] = {twoPlays: twoPlays, threePlays: threePlays};
    }

    for (const [email, {twoPlays, threePlays}] of Object.entries(stage2StatusMap)) {
      if (twoPlays && !email2UserInfoMap[email].inStage2) continue;
      if (!twoPlays && !email2UserInfoMap[email].inStage2) {
        console.error(`Error: User ${email2UserInfoMap[email].userId} had previously completed stage 2 but now appears to not have completed it.`);
        continue;
      }
      if (twoPlays && email2UserInfoMap[email].inStage2) {
        const stage1Start = dayjs(email2UserInfoMap[email].stage1StartedOn).tz('America/Los_Angeles')
        const today = dayjs().tz('America/Los_Angeles');

        if (today.diff(stage1Start, 'day') >= 7 || threePlays) {
          const progress = email2UserInfoMap[email].user.progress || {};
          progress.status = statusTypes.STAGE_2_COMPLETE;
          progress[statusTypes.STAGE_2_COMPLETED_ON] = today.format('YYYYMMDD');
          await db.updateUser(email2UserInfoMap[email].userId, {progress: progress});
        }
      }
    }
    return { status: 'success' };
  } catch (err) {
    console.error(`Error trying to process lumosity report (s3 key: ${record.s3.object.key})`)
    console.error(err, err.stack)
    throw(err)
  }
}

/**
 * Given CSV data from a lumosity game results report, returns a dataforge.DataFrame object with
 * 'email', 'game', 'dateTime', 'lpi' and 'multiPlay'. The 'multiPlay' value will be true if
 * the user played that game multiple times that day. The dateTime and lpi values will be for the
 * first play of the day in that case.
 * Some games lack LPI values. This returns 0 for the LPI in that case.
 * IMPORTANT: This method assumes that the lumosity report has records for each user in date order, 
 * which seems to be the case.
 * @param {string} gameResultsCSV 
 * @returns {object} DataFrame with 'email', 'game', 'dateTime', 'lpi' and 'multiPlay' keys.
 */
function lumosityGameResultsToPlaysByUserByGame(gameResultsCSV) {
  const df = dataForge.fromCSV(gameResultsCSV)
    .parseInts('nth_play')
    .dropSeries(['user_id', 'username', 'activation_code', 'game', 'score', 'user_level', 'session_level']);

    const res = [];
    const byEmail = df.groupBy(row => row.email_address);
    for (const e of byEmail) {
        const emailAddr = e.first().email_address;
        const byGame = e.groupBy(r => r.game_name);
        for (const game of byGame) {
          const gameName = game.first().game_name;
          const byDate = game.groupBy(r => dayjs(r.created_at_utc).tz('America/Los_Angeles').format('YYYY-MM-DD'));
          for (const date of byDate) {
            const multiPlay = date.count() > 1;
            const lpi = date.first().game_lpi === '' ? 0 : Number.parseInt(date.first().game_lpi);
            res.push({email: emailAddr, game: gameName, dateTime: dayjs(date.first().created_at_utc).tz('America/Los_Angeles').format('YYYY-MM-DD HH:mm:ss'), lpi: lpi, multiPlay: multiPlay});
          }
        }
    }

    return new dataForge.DataFrame(res);
}

async function getUserIdForLumosEmail(lumosEmail) {
  const baseParams = {
      TableName: lumosAcctTable,
      KeyConditionExpression: "email = :email",
      ExpressionAttributeValues: {":email": lumosEmail.replace(`@${awsSettings.LumosDomain}`, '')},
  };
  const dynResults = await docClient.send(new QueryCommand(baseParams));
  if (dynResults.Items.length === 0) return null;

  if (dynResults.Items.length > 1) {
      throw new Error(`Found multiple lumosity accounts with email address ${lumosEmail}.`);
  }

  return dynResults.Items[0].owner;
}

async function lastPlayDate(userId) {
  const baseParams = {
    TableName: lumosPlaysTable,
    KeyConditionExpression: "userId = :userId",
    ExpressionAttributeValues: {":userId": userId},
    ScanIndexForward: false,
    Limit: 1
  };
  const dynResults = await docClient.send(new QueryCommand(baseParams));
  if (dynResults.Items.length === 0) return '1970-01-01 00:00:00';

  return dynResults.Items[0].dateTime;
}

async function savePlaysData(data) {
  const putRequests = data.map(r => {
    return {
        PutRequest: {
            Item: {
                userId: r.userId,
                dateTime: r.dateTime,
                lpi: r.lpi,
                multiPlay: r.multiPlay,
                game: r.game
            }
        }
    };
  });

  // slice into arrays of no more than 25 PutRequests due to DynamoDB limits
  const chunks = [];
  for (let i = 0; i < putRequests.length; i += 25) {
      chunks.push(putRequests.slice(i, i + 25));
  }

  for (let i=0; i<chunks.length; i++) {
      const chunk = chunks[i];
      const params = { RequestItems: {} };
      params['RequestItems'][lumosPlaysTable] = chunk;
      await docClient.send(new BatchWriteCommand(params));
  }
}

/**
 * 
 * @param {object[]} data Array of {userId, date, gameCount} objects, where date is YYYY-MM-DD and gameCount is the number of games played that day.
 */
async function saveEarnings(data) {
  const putRequests = data.map(r => {
    return {
        PutRequest: {
            Item: {
                userId: r.userId,
                dateType: `${dayjs.tz(r.date, 'YYYY-MM-DD', 'America/Los_Angeles').format()}|${earningsTypes.LUMOSITY}`, // although we don't use the dayjs CustomParseFormat, our data-forge dependency does. It overrides our configuration of dayjs, meaning we need to specify the date format here.
                amount: earningsAmounts[earningsTypes.LUMOSITY]
            }
        }
    };
  });

  // slice into arrays of no more than 25 PutRequests due to DynamoDB limits
  const chunks = [];
  for (let i = 0; i < putRequests.length; i += 25) {
      chunks.push(putRequests.slice(i, i + 25));
  }

  for (let i=0; i<chunks.length; i++) {
      const chunk = chunks[i];
      const params = { RequestItems: {} };
      params['RequestItems'][earningsTable] = chunk;
      await docClient.send(new BatchWriteCommand(params));
  }
}
