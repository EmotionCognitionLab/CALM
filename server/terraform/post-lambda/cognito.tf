terraform {
  backend "s3" {
    bucket = "calm-tf-state"
    region = "us-west-2"
    key = "cognito"
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

# This is set in ../../lambdas/serverless.yml
data "aws_ssm_parameter" "post-confirmation-lambda-arn" {
  name = "/${var.project}/${var.env}/info/lambdas/write-user-on-verify/arn"
}

# This is set in ../main/cognito.tf
data "aws_ssm_parameter" "cognito-user-pool-id" {
  name = "/${var.project}/${var.env}/info/cognito/user-pool/id"
}

# do not change this without also changing it
# in ../main/cognito.tf
resource "aws_cognito_user_pool" "pool" {
    name = "${var.project}-${var.env}-users"
    password_policy {
      minimum_length = 12
    }
    account_recovery_setting {
      recovery_mechanism {
        name = "verified_phone_number"
        priority = 1
      }
    }
    user_attribute_update_settings {
      attributes_require_verification_before_update = ["phone_number"]
    }
    auto_verified_attributes = ["phone_number"]
    schema {
      attribute_data_type = "String"
      name = "phone_number"
      required = true
      mutable = true
      string_attribute_constraints {
          min_length = 12
          max_length = 12
      }
    }
    schema {
      attribute_data_type = "String"
      name = "given_name"
      required = true
      mutable = true
      string_attribute_constraints {
          min_length = 1
          max_length = 50
      }
    }
    schema {
      attribute_data_type = "String"
      name = "family_name"
      required = true
      mutable = true
      string_attribute_constraints {
          min_length = 1
          max_length = 50
      }
    }
    schema {
      attribute_data_type = "String"
      name = "email"
      required = true
      mutable = false
      string_attribute_constraints {
        min_length = 5
        max_length = 128
      }
    }
    schema {
      attribute_data_type = "String"
      name = "profile"
      required = false
      mutable = false
      string_attribute_constraints {
        min_length = 1
        max_length = 50
      }
    }
    schema {
      attribute_data_type = "String"
      name = "race"
      required = false
      mutable = false
      string_attribute_constraints {
        min_length = 1
        max_length = 32
      }
    }
    schema {
      attribute_data_type = "String"
      name = "sex"
      required = false
      mutable = false
      string_attribute_constraints {
        min_length = 1
        max_length = 32
      }
    }
    username_attributes = [ "phone_number" ]
    username_configuration {
      case_sensitive = false
    }
    lambda_config {
      post_confirmation = data.aws_ssm_parameter.post-confirmation-lambda-arn.value
    }
    lifecycle {
      ignore_changes = [ password_policy, schema ]
    }
}

