Feature: Drawing a city postcard
  As the MyPreflight platform
  I want a travel poster illustration for a city
  So that a flight to it can be presented with artwork instead of a placeholder

  Scenario: Drawing a postcard for a city
    Given OpenAI draws the postcard
    When I ask for a postcard of "Munich"
    Then the response status should be 200
    And the response body should contain:
      """
      {
        "city": "Munich",
        "model": "gpt-image-2",
        "size": "1152x1536",
        "quality": "high",
        "format": "jpeg",
        "contentType": "image/jpeg",
        "bytes": 160,
        "prompt": "@any",
        "image": "@any"
      }
      """

  Scenario: The prompt names the city and asks for a Polish tagline
    Given OpenAI draws the postcard
    When I ask for a postcard of "Kraków"
    Then the response status should be 200
    And the prompt sent to OpenAI should contain 'TARGET_CITY = "Kraków"'
    And the prompt sent to OpenAI should contain "tagline written in Polish"
    And the prompt sent to OpenAI should contain "All text and lettering must be in Polish."

  Scenario: Size, quality and format can be asked for per request
    Given OpenAI draws the postcard
    When I ask for a postcard with:
      | city    | Gdańsk    |
      | size    | 1024x1024 |
      | quality | low       |
      | format  | png       |
    Then the response status should be 200
    And the response property "contentType" should be "image/png"
    And OpenAI should have been asked for "size" "1024x1024"
    And OpenAI should have been asked for "quality" "low"
    And OpenAI should have been asked for "output_format" "png"

  Scenario: Compression is sent for JPEG only
    Given OpenAI draws the postcard
    When I ask for a postcard of "Munich"
    Then OpenAI should have been asked for "output_compression" "80"

  Scenario: Compression is left out of a PNG request
    Given OpenAI draws the postcard
    When I ask for a postcard with:
      | city   | Munich |
      | format | png    |
    Then OpenAI should not have been asked for "output_compression"

  Scenario: The same postcard is drawn once and served from cache afterwards
    Given OpenAI draws the postcard
    When I ask for a postcard of "Munich"
    And I ask for a postcard of "Munich"
    Then the response status should be 200
    And OpenAI should have been asked to draw 1 time

  Scenario: A city name is matched case-insensitively by the cache
    Given OpenAI draws the postcard
    When I ask for a postcard of "Munich"
    And I ask for a postcard of "munich"
    Then the response status should be 200
    And OpenAI should have been asked to draw 1 time

  Scenario: Another city is drawn on its own
    Given OpenAI draws the postcard
    When I ask for a postcard of "Munich"
    And I ask for a postcard of "Warsaw"
    Then the response status should be 200
    And OpenAI should have been asked to draw 2 times

  Scenario: The same city in another format is drawn again
    Given OpenAI draws the postcard
    When I ask for a postcard of "Munich"
    And I ask for a postcard with:
      | city   | Munich |
      | format | png    |
    Then the response status should be 200
    And OpenAI should have been asked to draw 2 times
