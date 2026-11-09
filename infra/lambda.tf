resource "random_password" "function_secret" {
  length  = 64
  special = false
}

resource "aws_cloudwatch_log_group" "function" {
  name              = "/aws/lambda/${local.name}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "function" {
  function_name    = local.name
  role             = aws_iam_role.function.arn
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  handler          = "lambda.handler"
  filename         = "${path.module}/../dist.zip"
  source_code_hash = filebase64sha256("${path.module}/../dist.zip")
  memory_size      = 512
  timeout          = 300

  environment {
    variables = {
      POSTCARD_FUNCTION_SECRET = random_password.function_secret.result
      OPENAI_API_KEY           = data.aws_ssm_parameter.openai_api_key.value
      S3_BUCKET                = aws_s3_bucket.postcards.id
      S3_PREFIX                = local.postcards_prefix
      S3_PUBLIC_BASE_URL       = "https://${local.postcards_domain}"
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.function.name
  }

  depends_on = [aws_iam_role_policy.function_logs]
}

resource "aws_lambda_function_url" "function" {
  function_name      = aws_lambda_function.function.function_name
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "function_url" {
  statement_id           = "FunctionUrlAllowPublicAccess"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.function.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "function_url_invoke" {
  statement_id             = "FunctionUrlAllowInvokeAction"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.function.function_name
  principal                = "*"
  invoked_via_function_url = true
}

resource "aws_lambda_function_event_invoke_config" "function" {
  function_name          = aws_lambda_function.function.function_name
  maximum_retry_attempts = 0
}
