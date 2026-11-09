resource "aws_acm_certificate" "postcards" {
  provider          = aws.us_east_1
  domain_name       = local.postcards_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "postcards" {
  provider        = aws.us_east_1
  certificate_arn = aws_acm_certificate.postcards.arn

  timeouts {
    create = "20m"
  }
}

resource "aws_cloudfront_origin_access_control" "postcards" {
  name                              = var.postcards_bucket_name
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_distribution" "postcards" {
  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  price_class     = "PriceClass_100"
  aliases         = [local.postcards_domain]
  comment         = local.postcards_domain

  origin {
    origin_id                = "postcards"
    domain_name              = aws_s3_bucket.postcards.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.postcards.id
  }

  default_cache_behavior {
    target_origin_id       = "postcards"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
    compress               = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.postcards.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
