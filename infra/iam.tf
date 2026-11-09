resource "aws_iam_role" "function" {
  name                 = local.name
  path                 = "/${local.name}/"
  permissions_boundary = data.aws_ssm_parameter.workload_boundary_arn.value

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "function_logs" {
  name = "logs"
  role = aws_iam_role.function.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.function.arn}:*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "function_render" {
  name = "render"
  role = aws_iam_role.function.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "WritePostcards"
        Effect   = "Allow"
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.postcards.arn}/${local.postcards_prefix}*"
      },
      {
        Sid      = "InvokeItself"
        Effect   = "Allow"
        Action   = "lambda:InvokeFunction"
        Resource = aws_lambda_function.function.arn
      }
    ]
  })
}
