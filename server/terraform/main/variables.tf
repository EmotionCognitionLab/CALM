variable "region" {
    description = "The AWS region where the infrastructure should be deployed."
}

variable "env" {
    description = "Defines the environment (e.g. dev, QA, production) this infrastructure is intended for."
}

variable "project" {
    description = "The name of the project. Should be short, as it is used as a prefix for most resources."
}

variable "cognito-callback-urls" {
    description = "The list of urls the user may be redirected to after authentication. Must be absolute and must be https unless it is localhost."
}

variable "cognito-logout-url" {
    description = "The url the user is redirected to after signing out."
}

variable "cognito-redirect-uri" {
  description = "The URL to which cognito redirects the browser after authorization. Must be absolute and must be https unless it is localhost."
}

variable "ses-emailed-reports-bucket" {
    description = "Name for S3 bucket that will hold reports emailed to us from Lumosity"
}

variable "error-notification-emails" {
    description = "Space-separated list of email addresses for recipients of console errors"
    sensitive = true
}

variable "redcap-inbound-token" {
    description = "Token sent by REDCap to us"
    sensitive = true
}

variable "redcap-staff-rcid" {
    description = "RCID placeholder for staff"
    sensitive = true
}

variable "redcap-api-url" {
    description = "URL for REDCap API"
    sensitive = true
}

variable "redcap-api-token-prod" {
    description = "API token for REDCap CALM prod project"
    sensitive = true
}

variable "redcap-api-token-dev" {
    description = "API token for REDCap CALM dev project"
    sensitive = true
}

variable "redcap-backup-bucket" {
    description = "S3 bucket to store REDCap backups"
}

variable "participant-status-report-recipients" {
    description = "Recipients of participant status reports"
    sensitive = true
}

variable "data-bucket" {
    description =  "S3 bucket for participant data"
}
