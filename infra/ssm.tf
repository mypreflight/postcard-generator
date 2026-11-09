resource "aws_ssm_parameter" "url" {
  name  = "/mypreflight/${local.name}/url"
  type  = "String"
  value = trimsuffix(aws_lambda_function_url.function.function_url, "/")
}

resource "aws_ssm_parameter" "secret" {
  name  = "/mypreflight/${local.name}/secret"
  type  = "SecureString"
  value = random_password.function_secret.result
}

resource "aws_ssm_parameter" "openai_api_key" {
  name             = "/mypreflight/${local.name}/openai-api-key"
  type             = "SecureString"
  value_wo         = var.openai_api_key
  value_wo_version = var.openai_api_key_version
}

data "aws_ssm_parameter" "openai_api_key" {
  name = aws_ssm_parameter.openai_api_key.name
}
