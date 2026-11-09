variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "log_retention_days" {
  type    = number
  default = 7
}

variable "postcards_bucket_name" {
  type    = string
  default = "mypreflight-postcards"
}

variable "openai_api_key" {
  type      = string
  sensitive = true
  ephemeral = true

  validation {
    condition     = length(var.openai_api_key) > 0
    error_message = "Set TF_VAR_openai_api_key."
  }
}

variable "openai_api_key_version" {
  type    = number
  default = 1
}
