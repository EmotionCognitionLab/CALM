terraform {
  backend "s3" {
    bucket = "calm-tf-state"
    region = "us-west-2"
    key = "main"
    workspace_key_prefix = "workspaces"
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.68"
    }
  }
}

provider "aws" {
    region = var.region
}

# S3 bucket for participant data
resource "aws_s3_bucket" "data-bucket" {
  bucket = "${var.data-bucket}"
}

resource "aws_s3_bucket_versioning" "data-bucket-versioning" {
  bucket = aws_s3_bucket.data-bucket.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket" "ses-bucket" {
  bucket = "${var.ses-emailed-reports-bucket}"
}

# save above bucket name to SSM so serverless can reference it
resource "aws_ssm_parameter" "lambda-ses-bucket" {
  name = "/${var.project}/${var.env}/info/lambda/ses/bucket"
  description = "Bucket from which lambda should process emails received from SES"
  type = "SecureString"
  value = "${aws_s3_bucket.ses-bucket.bucket}"
}

# pre-create the "folders" in the bucket so we can 
# lock down access to only those paths
resource "aws_s3_object" "ses-emails" {
  bucket = aws_s3_bucket.ses-bucket.bucket
  key = "emails/"
}

# save above prefix to SSM so serverless can reference it
resource "aws_ssm_parameter" "lambda-ses-prefix" {
  name = "/${var.project}/${var.env}/info/lambda/ses/prefix"
  description = "Bucket from which lambda should process emails received from SES"
  type = "SecureString"
  value = "${aws_s3_object.ses-emails.key}"
}

resource "aws_s3_object" "ses-reports" {
  bucket = aws_s3_bucket.ses-bucket.bucket
  key = "reports/"
}

resource "aws_cloudwatch_log_group" "console-log-group" {
  name = "${var.project}-${var.env}-console"
  retention_in_days = 30
}

output "console_log_writer_id" {
  value = aws_iam_access_key.console-log-writer-key.id
}

resource "aws_cloudwatch_log_metric_filter" "console-error" {
  name = "${var.project}-${var.env}-console-error"
  pattern = "error"
  log_group_name = aws_cloudwatch_log_group.console-log-group.name

  metric_transformation {
    name = "${var.project}-${var.env}-console-error-count"
    namespace = "LogMetrics"
    value = "1"
  }
}

# provisioner is used b/c trying to set up an email
# subscription to an sns topic via aws_sns_topic_subscription
# fails with:
# error creating SNS topic subscription: InvalidParameter: Invalid parameter: Email address
# provisioner will only run when the topic is first created
# and will *not* update the subscriptions when var.error-notification-emails is changed.
# https://medium.com/@raghuram.arumalla153/aws-sns-topic-subscription-with-email-protocol-using-terraform-ed05f4f19b73
# https://github.com/rarumalla1/terraform-projects/tree/master/aws-sns-email-subscription-terraform-using-command
resource "aws_sns_topic" "errors" {
  name = "${var.project}-${var.env}-errors-topic"
  provisioner "local-exec" {
    command = "/usr/bin/env bash sns-subscription.sh"
    environment = {
      sns_arn = self.arn
      sns_emails = var.error-notification-emails
     }
  }
}

resource "aws_cloudwatch_metric_alarm" "console-error-alarm" {
  alarm_name = "${var.project}-${var.env}-console-error-alarm"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods = 1
  period = 300
  metric_name = "${var.project}-${var.env}-console-error-count"
  namespace = "LogMetrics"
  statistic = "Sum"
  threshold = 0
  alarm_actions = [aws_sns_topic.errors.arn]
  datapoints_to_alarm = 1
  treat_missing_data = "notBreaching"
}

resource "aws_ssm_parameter" "redcap-inbound-token" {
  name = "/${var.project}/${var.env}/info/redcap/inbound/token"
  description = "Token REDCap sends us"
  type = "SecureString"
  value = var.redcap-inbound-token
}

resource "aws_ssm_parameter" "staff-rcid" {
  name = "/${var.project}/${var.env}/info/redcap/staff/rcid"
  description = "RCID placeholder for staff"
  type = "SecureString"
  value = var.redcap-staff-rcid
}

resource "aws_ssm_parameter" "participant-status-report-recipients" {
  name = "/${var.project}/${var.env}/info/report/status/recipients"
  description = "Recipients of participant status report"
  type = "SecureString"
  value = var.participant-status-report-recipients
}

# SES rules to write email to bucket
resource "aws_ses_receipt_rule_set" "main" {
  rule_set_name = "${var.project}-ses-rules"
}

resource "aws_ses_active_receipt_rule_set" "main" {
  rule_set_name = "${var.project}-ses-rules"
  depends_on = [aws_ses_receipt_rule_set.main]
}

resource "aws_ses_receipt_rule" "save-to-s3" {
  name          = "${var.env}-save-to-s3"
  rule_set_name = "${var.project}-ses-rules"
  recipients    = ["lumosityreports@mindbodystudy.org"]
  enabled       = true
  scan_enabled  = true

  s3_action {
    bucket_name = "${var.ses-emailed-reports-bucket}"
    object_key_prefix = "emails"
    position    = 1
  }

  depends_on = [aws_s3_bucket_policy.receive]
}

