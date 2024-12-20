import "./style.css";
import ApiClient from "../../common/api/client";
import awsSettings from "../../common/aws-settings.json";
import { confirmSignUp, resendSignUpConfirmationCode } from "auth/auth";

async function init() {
    hideError();

    const query = new URLSearchParams(window.location.search.substring(1));
    const rcid = query.get('rcid');
    if (!rcid || rcid === '') {
        showError('No REDCap ID found. Unable to continue.');
        return;
    }

    const fakeSession = {
        getIdToken: () => ({
            getJwtToken: () => ""
        })
    };
    const client = new ApiClient(fakeSession);
    try {
        const rcidCheck = await client.rcidExists(rcid);
        if (rcidCheck.idExists) {
            showError(`The REDCap id ${rcid} is already in use. Unable to continue.`);
            return;
        }
    } catch (err) {
        console.error('Error checking if rcid exists', err);
        showError(`An error has occurred. Please ask the researcher for assistance. (Error: ${err.message})`);
        return;
    }
    

    document.getElementById("passwordConfirm").addEventListener('paste', async (event) => {
        event.preventDefault();
        return false;
    });

    document.getElementById("submit-button").addEventListener('click', async (event) => {
        event.preventDefault();
        validateAndConfirm();
    });

    document.getElementById("submitPhoneVerification").addEventListener('click', async (event) => {
        event.preventDefault();
        await verifyPhone();
    });

    document.getElementById("resendPhoneCodeNormal").addEventListener('click', async (event) => {
        event.preventDefault();
        const userId = window.sessionStorage.getItem("userId");
        await resendSignUpConfirmationCode(userId);
    });

    document.getElementById("editRegInfo").addEventListener('click', async (event) => {
        event.preventDefault();
        document.getElementById("researcher-confirmation").classList.add("hidden");
        document.getElementById("registration-form").classList.remove("hidden");
    });

    document.getElementById("researcherVerification").addEventListener('input', async (event) => {
        if (event.target.value === 'info matches redcap') {
            document.getElementById('submitResearcherVerification').disabled = false;
        } else {
            document.getElementById('submitResearcherVerification').disabled = true;
        }
    });

    document.getElementById("submitResearcherVerification").addEventListener('click', async (event) => {
        event.preventDefault();
        await registerUser(client);
    });
    
    showRegForm(rcid);
   
}

function registrationFormIsValid() {
    let isValid = true;

    const regInfo = getRegistrationInfo();
    const phone = regInfo.elements.phone;
    const phoneErr = document.getElementById("phoneErr");
    if (phone.validity.valid) {
        phoneErr.textContent = "";
        phoneErr.className = "error hidden";
    } else {
        if (phone.validity.patternMismatch) {
            phoneErr.textContent = "Phone numbers may only contain numbers, - and ( ).";
        }
        const trimmedPhone = phone.value.replaceAll(/[^0-9]+/g, "");
        if (trimmedPhone.length == 0) {
            phoneErr.textContent = "You must enter a phone number.";
        } else if (trimmedPhone.length < 10 || trimmedPhone.length > 11 || (trimmedPhone.length == 11 && trimmedPhone[0] != '1')) {
            phoneErr.textContent = "Please enter your phone number with area code";
        }
        phoneErr.className = "error";
        isValid = false;
    }

    const email = regInfo.elements.email;
    const emailErr = document.getElementById("emailErr");
    if (email.validity.valid) {
        emailErr.textContent = ""
        emailErr.className = "error hidden"
    } else {
        if (email.validity.valueMissing) {
            emailErr.textContent = "You must enter an email address."
        }
        emailErr.className = "error"
        isValid = false
    }

    const raceErr = document.getElementById("raceErr");
    if (regInfo.values.race !== "black" && regInfo.values.race !== "white") {
        raceErr.textContent = "Please select a race.";
        raceErr.className = "error";
        isValid = false;
    } else {
        raceErr.textContent = "";
        raceErr.className = "error hidden";
    }

    const sexErr = document.getElementById("sexErr");
    if (regInfo.values.sex !== "female" && regInfo.values.sex !== "male" && regInfo.values.sex !== "intersex") {
        sexErr.textContent = "Please select a sex.";
        sexErr.className = "error";
        isValid = false;
    } else {
        sexErr.textContent = "";
        sexErr.className = "error hidden";
    }

    const password = regInfo.elements.password;
    const passwordConfirm = regInfo.elements.passwordConfirm;
    const passErr = document.getElementById("passwordConfirmErr");
    if (password.validity.valid) {
        if (password.value === passwordConfirm.value) {
            passErr.textContent = "";
            passErr.className = "error hidden";
        } else {
            passErr.textContent = "Both passwords must be the same.";
            passErr.className = "error";
            isValid = false;
        }
    } else {
        if (password.validity.valueMissing)  {
            passErr.textContent = "You must enter a password.";
        } else if (password.validity.tooShort) {
            passErr.textContent = "Passwords must be at least 12 characters long.";
        }
        passErr.className = "error";
        isValid = false;
    }

    const msgConsent = regInfo.elements.msgConsent;
    const msgConsentErr = document.querySelector("#msgConsentErr");
    if (msgConsent.validity.valid) {
        msgConsentErr.textContent = "";
        msgConsentErr.className = "error hidden";
    } else {
        msgConsentErr.textContent = "You must select this if you wish to continue.";
        msgConsentErr.className = "error";
        isValid = false;
    }

    return isValid;
}

function validateAndConfirm() {
    if (!registrationFormIsValid()) {
        return;
    }
    const regInfo = getRegistrationInfo();
    document.getElementById("registration-form").classList.add("hidden");
    document.getElementById("name-confirm").innerHTML = regInfo.values.firstName + " " + regInfo.values.lastName;
    document.getElementById("email-confirm").innerHTML = regInfo.values.email;
    document.getElementById("phone-confirm").innerHTML = regInfo.values.phone;
    document.getElementById("researcher-confirmation").classList.remove("hidden");
}

async function registerUser(client) {
    const regInfo = getRegistrationInfo()

    let phone = regInfo.values.phone;
    phone = phone.replaceAll(/[^0-9]+/g, "");
    // phone format is +12135551212
    if (!phone.startsWith("1")) {
        phone = "1" + phone;
    }
    phone = "+" + phone;

    try {
        const resp = await client.registerUser(regInfo.values.firstName, regInfo.values.lastName, regInfo.values.email, phone, regInfo.values.race, regInfo.values.sex, regInfo.values.password, regInfo.values.rcid);
        const userId = resp.sub;
        window.sessionStorage.setItem("userId", userId);
        document.getElementById("researcher-confirmation").classList.add("hidden");
        document.getElementById("phoneVerification").classList.remove("hidden");
    } catch (err) {
        showError(err.message);
    }
}

async function verifyPhone() {
    const verifyErrDiv = document.getElementById("phoneVerificationError");
    verifyErrDiv.classList.add("hidden");
    verifyErrDiv.textContent = "";
    const code = document.getElementById("phoneVerificationCode").value;
    const userId = window.sessionStorage.getItem("userId");
    try {
        await confirmSignUp(userId, code);
        window.sessionStorage.removeItem("userId");
        window.location.href=`${awsSettings.RedirectUriSignIn}?needsValidation=1`;
    } catch (err) {
        console.error('Error confirming phone number verification code', err);
        verifyErrDiv.textContent = "An error occurred while verifying your phone number. Please try again."
        verifyErrDiv.classList.remove("hidden");
    }
}

function getRegistrationInfo() {
    const firstName = document.getElementById("firstName");
    const lastName = document.getElementById("lastName")
    const email = document.getElementById("email");
    const phone = document.getElementById("phone");
    const race = document.getElementById("race");
    const sex = document.getElementById("sex");
    const password = document.getElementById("password");
    const msgConsent = document.getElementById("msgConsent");
    const rcid = document.getElementById("rcid");
    const passwordConfirm = document.getElementById("passwordConfirm");
    const elements = {
        firstNname: firstName, lastName: lastName, email: email, race: race, sex: sex, phone: phone, password: password, 
        passwordConfirm: passwordConfirm, msgConsent: msgConsent, rcid: rcid
    };
    const values = {
        firstName: firstName.value, lastName: lastName.value, email: email.value, race: race.value, sex: sex.value, phone: phone.value, password: password.value, 
        passwordConfirm: passwordConfirm.value, msgConsent: msgConsent.value, rcid: rcid.value
    };

    return {
        elements: elements,
        values: values
    };
}

function showRegForm(rcid) {
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("registration-form").classList.remove("hidden");
    document.getElementById("rcid").value = rcid;
}
 
function showError(errMsg) {
    const errDiv = document.getElementById("errors");
    errDiv.innerHTML = `Something has gone wrong. Please ask the researcher for assistance. Error message: ${errMsg}`;
    errDiv.classList.remove("hidden");
}

function hideError() {
    const errDiv = document.getElementById("errors");
    errDiv.classList.add("hidden");
}

(async() => {
    init();
})();
