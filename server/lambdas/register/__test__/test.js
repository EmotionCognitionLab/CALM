
'use strict';
import { signUp } from "../register.js";
import { cognitoClient } from "../../common/aws-clients.js";

const userSub = "123abc";
const mockCognitoSignUp = jest.fn(() => ({UserSub: userSub}));


jest.mock("../../common/aws-clients.js");
cognitoClient.signUp = mockCognitoSignUp;

describe("signUp", () => {

    afterEach(() => mockCognitoSignUp.mockClear());

    it("should return an error if there is no phone number", async() => {
        const event = buildSignUpEvent({phone: null});
        await testSignUp(event, 400, "One or more required parameters are missing.", 0);
    });

    it("should return an error if there is no password", async() => {
        const event = buildSignUpEvent({password: null});
        await testSignUp(event, 400, "One or more required parameters are missing.", 0);
    });

    it("should return an error if there is no first name", async() => {
        const event = buildSignUpEvent({firstName: null});
        await testSignUp(event, 400, "One or more required parameters are missing.", 0);
    });

    it("should return an error if there is no last name", async() => {
        const event = buildSignUpEvent({lastName: null});
        await testSignUp(event, 400, "One or more required parameters are missing.", 0);
    });

    it("should return an error if there is no email", async() => {
        const event = buildSignUpEvent({email: null});
        await testSignUp(event, 400, "One or more required parameters are missing.", 0);
    });

    it("should return an error if there is no race", async() => {
        const event = buildSignUpEvent({race: null});
        await testSignUp(event, 400, "One or more required parameters are missing.", 0);
    });

    it("should return an error if the race is not valid", async() => {
        const event = buildSignUpEvent({race: "afesjofa"});
        await testSignUp(event, 400, "You must enter a valid race.", 0);
    });

    it("should return an error if there is no sex", async() => {
        const event = buildSignUpEvent({sex: null});
        await testSignUp(event, 400, "One or more required parameters are missing.", 0);
    });

    it("should return an error if the sex is invalid", async() => {
        const event = buildSignUpEvent({sex: "jklafen"});
        await testSignUp(event, 400, "You must enter a valid sex.", 0);
    });

    it("should return an error if there is no rcid", async() => {
        const event = buildSignUpEvent({rcid: null});
        await testSignUp(event, 400, "One or more required parameters are missing.", 0);
    });

    it("should return an error if the email address is not valid", async() => {
        const event = buildSignUpEvent({email: "noemail"});
        await testSignUp(event, 400, "You must enter a valid email address.", 0);
    })

    it("should return an error if the password is less than 12 characters long", async() => {
        const event = buildSignUpEvent({password: "short-pass"});
        await testSignUp(event, 400, "Password must be at least 12 characters.", 0);
    });

    it("should return an error if the phone number is not 12 characters long", async() => {
        const event = buildSignUpEvent({phone: "+1212555123"});
        await testSignUp(event, 400, "Phone number must be in the form +12135551212.", 0);
    });

    it("should return an error if the phone number does not begin with a plus sign", async() => {
        const event = buildSignUpEvent({phone: "991212555123"});
        await testSignUp(event, 400, "Phone number must be in the form +12135551212.", 0);
    });

    it("should return an error if the phone number does not match the pattern +1[\d]{10}", async() => {
        const event = buildSignUpEvent({phone: "+9121255512a"});
        await testSignUp(event, 400, "Phone number must be in the form +12135551212.", 0);
    });

    it("should sign the user up with cognito if everything is in order", async() => {
        const event = buildSignUpEvent({phone: "+12125551234", password: "twelvechars!!", firstName: "Nobody", lastName: "Here", email: "nobody@example.com", race: "black", sex: "female", rcid: "1234"});
        await testSignUp(event, 200, JSON.stringify({status: "success", sub: userSub}), 1);
    });

});

function buildSignUpEvent({phone="+12125551234", password="twelvechars!!", firstName="Nobody", lastName="Here", email="nobody@example.com", race="black", sex="female", rcid="1234"}) {
    return {
        body: JSON.stringify({
            phone: phone,
            password: password,
            firstName: firstName,
            lastName: lastName,
            email: email,
            race: race,
            sex: sex,
            rcid: rcid
        })
    };
}

async function testSignUp(event, expectedStatus, expectedError, expectedCognitoSignUpTimes) {
    const res = await signUp(event);
    expect(res.statusCode).toEqual(expectedStatus);
    expect(res.body).toBe(expectedError);
    expect(mockCognitoSignUp).toBeCalledTimes(expectedCognitoSignUpTimes);
}