Feature: Reporting failures honestly
  As the MyPreflight platform
  I want upstream trouble reported with a distinct status and code
  So that a refused prompt is never mistaken for an outage

  Scenario: An upstream outage answers bad gateway
    Given OpenAI is unavailable
    When I ask for a postcard of "Munich"
    Then the response status should be 502
    And the response body should contain:
      """
      {
        "error": {
          "code": "OPENAI_UNAVAILABLE",
          "message": "OpenAI is unavailable.",
          "status": 502
        }
      }
      """

  Scenario: A rate limited request keeps its own status
    Given OpenAI is rate limiting
    When I ask for a postcard of "Munich"
    Then the response status should be 429
    And the response body should contain:
      """
      {
        "error": {
          "code": "OPENAI_RATE_LIMITED",
          "message": "OpenAI is rate limiting image generation.",
          "status": 429
        }
      }
      """

  Scenario: A refused prompt is reported as unprocessable, not as an outage
    Given OpenAI rejects the prompt
    When I ask for a postcard of "Munich"
    Then the response status should be 422
    And the response body should contain:
      """
      {
        "error": {
          "code": "POSTCARD_REJECTED",
          "message": "OpenAI refused to draw this postcard: Your request was rejected by the safety system.",
          "status": 422
        }
      }
      """

  Scenario: An answer without image data is reported as unreadable
    Given OpenAI answers without image data
    When I ask for a postcard of "Munich"
    Then the response status should be 502
    And the response body should contain:
      """
      {
        "error": {
          "code": "POSTCARD_UNREADABLE",
          "message": "OpenAI answered without a usable image payload.",
          "status": 502
        }
      }
      """

  Scenario: A postcard beyond the function result limit is refused rather than truncated
    Given OpenAI draws a postcard of 900 kilobytes
    When I ask for a postcard of "Munich"
    Then the response status should be 502
    And the response error code should be "POSTCARD_TOO_LARGE"

  Scenario: A failed draw is not cached
    Given OpenAI is unavailable
    When I ask for a postcard of "Munich"
    And I ask for a postcard of "Munich"
    Then the response status should be 502
    And OpenAI should have been asked to draw 2 times
