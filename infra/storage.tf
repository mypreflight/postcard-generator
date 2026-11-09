resource "aws_s3_bucket" "postcards" {
  bucket = var.postcards_bucket_name
}

resource "aws_s3_bucket_ownership_controls" "postcards" {
  bucket = aws_s3_bucket.postcards.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "postcards" {
  bucket                  = aws_s3_bucket.postcards.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "postcards" {
  bucket = aws_s3_bucket.postcards.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_policy" "postcards" {
  bucket = aws_s3_bucket.postcards.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontRead"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.postcards.arn}/${local.postcards_prefix}*"
        Condition = {
          StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.postcards.arn }
        }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.postcards.arn, "${aws_s3_bucket.postcards.arn}/*"]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.postcards]
}
