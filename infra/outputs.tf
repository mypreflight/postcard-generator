output "function_name" {
  value = aws_lambda_function.function.function_name
}

output "function_url" {
  value = trimsuffix(aws_lambda_function_url.function.function_url, "/")
}

output "postcards_bucket" {
  value = aws_s3_bucket.postcards.id
}

output "postcards_certificate_validation" {
  value = {
    for option in aws_acm_certificate.postcards.domain_validation_options : option.domain_name => {
      name  = option.resource_record_name
      type  = option.resource_record_type
      value = option.resource_record_value
    }
  }
}

output "postcards_cname_target" {
  value = aws_cloudfront_distribution.postcards.domain_name
}
