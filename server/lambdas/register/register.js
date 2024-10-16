import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { cognitoClient, dynamoDocClient as docClient } from "../common/aws-clients.js";
import awsSettings from "../../../common/aws-settings.json";

const usersTable = process.env.USERS_TABLE;
const staffRcid = process.env.STAFF_LABEL;

const validRaces = ["black", "white"];
const validSexes = ["male", "female", "intersex"];

exports.rcidExists = async (event) => {
    const rcid = event.pathParameters.rcid;

    // Staff can register with a particular rcid
    // that doesn't actually exist and therefore
    // isn't checked. This keeps them from needing
    // to be in the REDCap database.
    if (rcid == staffRcid) {
        return JSON.stringify({"idExists": false})
    }

    if (!rcid || rcid === '' || Number.isNaN(Number.parseInt(rcid))) {
        return {
            statusCode: 400,
            body: {"error": "Invalid rcid parameter"}
        }
    }

    const userRecs = await docClient.send(new ScanCommand({
        TableName: usersTable,
        FilterExpression: 'rcid = :rcid',
        ExpressionAttributeValues: { ':rcid': rcid }
    }));

    const idExists = userRecs.Items.length > 0;
    return JSON.stringify({"idExists": idExists});
}

exports.signUp = async (event) => {
    try {
        // validate inputs
        const props = JSON.parse(event.body);
        const password = props.password;
        const phone = props.phone;
        const firstName = props.firstName;
        const lastName = props.lastName;
        const email = props.email;
        const race = props.race;
        const sex = props.sex;
        const rcid = props.rcid;
        for (const i of [password, phone, firstName, lastName, email, race, sex, rcid]) {
            if (!i || i.trim().length == 0) {
                return errResponse(400, "One or more required parameters are missing.");
            }
        };
        if (password.length < 12) {
            return errResponse(400, "Password must be at least 12 characters.")
        }
        if (phone.length != 12 || !phone.match(/\+1[\d]{10}/)) {
            return errResponse(400, "Phone number must be in the form +12135551212.");
        }
        // email pattern from https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/email#validation
        if (!email.match(/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/)) {
                return errResponse(400, "You must enter a valid email address.");
        }

        if (!validRaces.includes(race)) {
            return errResponse(400, "You must enter a valid race.")
        }

        if (!validSexes.includes(sex)) {
            return errResponse(400, "You must enter a valid sex.")
        }

        // call cognito to register user
        const params = {
            ClientId: awsSettings.ClientId,
            Username: phone,
            Password: password,
            UserAttributes: [
                {
                    Name: "given_name",
                    Value: firstName
                },
                {
                    Name: "family_name",
                    Value: lastName
                },
                {
                    Name: "email",
                    Value: email
                },
                {
                    Name: "phone_number",
                    Value: phone
                },
                {
                    Name: "profile",
                    Value: rcid
                },
                {   Name: 'custom:race',
                    Value: race
                },
                {   Name: 'custom:sex',
                    Value: sex
                }
            ]
        }

        const resp = await cognitoClient.signUp(params);

        return {
            statusCode: 200,
            body: JSON.stringify({status: "success", sub: resp.UserSub}),
            headers: {
                "Access-Control-Allow-Origin": "*"
            }
        };
    } catch (err) {
        console.error(err);
        return errResponse(500, err.message);
    }
}

function errResponse(code, msg) {
    return {
        statusCode: code,
        body: msg,
        headers: {
            "Access-Control-Allow-Origin": "*"
        }
    }
}