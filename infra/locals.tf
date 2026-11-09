locals {
  name             = "postcard-generator"
  bundle_path      = "${path.module}/../packages/postcard/city/dist/lambda.js"
  postcards_domain = "postcards.mypreflight.io"
  postcards_prefix = "postcards/"
}
