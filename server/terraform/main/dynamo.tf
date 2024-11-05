
# DynamoDB setup
resource "aws_dynamodb_table" "users-table" {
  name           = "${var.project}-${var.env}-users"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "userId"
  point_in_time_recovery {
    enabled = "${terraform.workspace == "prod" ? true : false}"
  }

  attribute {
    name = "userId"
    type = "S"
  }

}

# save above table name to SSM so serverless can reference it
resource "aws_ssm_parameter" "dynamo-users-table" {
  name = "/${var.project}/${var.env}/info/dynamo/table/users"
  description = "Dynamo table holding user information"
  type = "SecureString"
  value = "${aws_dynamodb_table.users-table.name}"
}

resource "aws_dynamodb_table" "experiment-data-table" {
  name           = "${var.project}-${var.env}-experiment-data"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "userId"
  range_key      = "dateTimeExperiment"
  point_in_time_recovery {
    enabled = "${terraform.workspace == "prod" ? true : false}"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "dateTimeExperiment"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

}

# save above table name to SSM so serverless can reference it
resource "aws_ssm_parameter" "dynamo-experiment-data-table" {
  name = "/${var.project}/${var.env}/info/dynamo/table/experiments"
  description = "Dynamo table holding experiment data"
  type = "SecureString"
  value = "${aws_dynamodb_table.experiment-data-table.name}"
}

resource "aws_dynamodb_table" "sessions-table" {
  name           = "${var.project}-${var.env}-sessions"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "userId"
  range_key = "startDateTime"
  point_in_time_recovery {
    enabled = "${terraform.workspace == "prod" ? true : false}"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "startDateTime"
    type = "N"
  }
}

# save above table name to SSM so serverless can reference it
resource "aws_ssm_parameter" "dynamo-sessions-table" {
  name = "/${var.project}/${var.env}/info/dynamo/table/sessions"
  description = "Dynamo table holding user breathing data"
  type = "SecureString"
  value = "${aws_dynamodb_table.sessions-table.name}"
}

resource "aws_dynamodb_table" "earnings-table" {
  name           = "${var.project}-${var.env}-earnings"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "userId"
  range_key      = "dateType"
  point_in_time_recovery {
    enabled = "${terraform.workspace == "prod" ? true : false}"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "dateType"
    type = "S"
  }
}

# save above table name to SSM so serverless can reference it
resource "aws_ssm_parameter" "earnings-table" {
  name = "/${var.project}/${var.env}/info/dynamo/table/earnings"
  description = "Dynamo table holding earnings info"
  type = "SecureString"
  value = "${aws_dynamodb_table.earnings-table.name}"
}

resource "aws_dynamodb_table" "lumos-acct-table" {
  name           = "${var.project}-${var.env}-lumos-acct"
  billing_mode   = "PROVISIONED"
  read_capacity  = 1
  write_capacity = 1
  hash_key       = "email"
  point_in_time_recovery {
    enabled = "${terraform.workspace == "prod" ? true : false}"
  }

  attribute {
    name = "email"
    type = "S"
  }
}

# save above table name to SSM so serverless can reference it
resource "aws_ssm_parameter" "lumos-acct-table" {
  name = "/${var.project}/${var.env}/info/dynamo/table/lumosacct"
  description = "Dynamo table holding lumosity account info"
  type = "SecureString"
  value = "${aws_dynamodb_table.lumos-acct-table.name}"
}

resource "aws_dynamodb_table" "lumos-plays-table" {
  name           = "${var.project}-${var.env}-lumos-plays"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "userId"
  range_key      = "dateTime"
  point_in_time_recovery {
    enabled = "${terraform.workspace == "prod" ? true : false}"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "dateTime"
    type = "S"
  }
}

# save above table name to SSM so serverless can reference it
resource "aws_ssm_parameter" "lumos-plays-table" {
  name = "/${var.project}/${var.env}/info/dynamo/table/lumosplays"
  description = "Dynamo table holding lumosity plays info"
  type = "SecureString"
  value = "${aws_dynamodb_table.lumos-plays-table.name}"
}
