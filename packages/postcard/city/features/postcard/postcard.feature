Feature: Drawing a city postcard
  As the MyPreflight platform
  I want a travel poster illustration for a city stored under a uuid I chose
  So that a flight to it can be presented with artwork instead of a placeholder

  Background:
    Given the bucket accepts the postcard

  Scenario: Drawing a postcard for a city
    Given OpenAI draws the postcard
    When I ask for a postcard of "Munich" as "11111111-2222-4333-8444-555555555555"
    Then the response status should be 200
    And the response body should contain:
      """
      {
        "city": "Munich",
        "country": "Germany",
        "continent": "Europe",
        "uuid": "11111111-2222-4333-8444-555555555555",
        "model": "gpt-image-2",
        "size": "1152x1536",
        "quality": "high",
        "format": "jpeg",
        "contentType": "image/jpeg",
        "bytes": 160,
        "prompt": "@any",
        "key": "postcards/11111111-2222-4333-8444-555555555555.jpg",
        "url": "@any"
      }
      """

  Scenario: The postcard is stored rather than answered with
    Given OpenAI draws the postcard
    When I ask for a postcard of "Munich"
    Then the response status should be 200
    And the response body should not have the property "image"
    And the bucket should have been asked to store 1 time

  Scenario: The object is named after the uuid it was asked for
    Given OpenAI draws the postcard
    When I ask for a postcard of "Munich" as "11111111-2222-4333-8444-555555555555"
    Then the response status should be 200
    And the postcard should have been stored at "/mypreflight-postcards/postcards/11111111-2222-4333-8444-555555555555.jpg"

  Scenario: A png postcard is stored under a png name
    Given OpenAI draws the postcard
    When I ask for a postcard with:
      | city   | Munich                               |
      | uuid   | 11111111-2222-4333-8444-555555555555 |
      | format | png                                  |
    Then the response status should be 200
    And the postcard should have been stored at "/mypreflight-postcards/postcards/11111111-2222-4333-8444-555555555555.png"
    And the response property "key" should be "postcards/11111111-2222-4333-8444-555555555555.png"

  Scenario: A uuid is stored in lower case, so one postcard never lands under two names
    Given OpenAI draws the postcard
    When I ask for a postcard of "Munich" as "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE"
    Then the response status should be 200
    And the response property "uuid" should be "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    And the postcard should have been stored at "/mypreflight-postcards/postcards/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg"

  Scenario: The upload is signed the way Spaces expects
    Given OpenAI draws the postcard
    When I ask for a postcard of "Munich"
    Then the response status should be 200
    And the stored object should be signed for Spaces
    And the stored object should carry the header "content-type" "image/jpeg"
    And the stored object should carry the header "x-amz-acl" "public-read"

  Scenario: The response points at where the postcard can be read
    Given OpenAI draws the postcard
    When I ask for a postcard of "Munich" as "11111111-2222-4333-8444-555555555555"
    Then the response status should be 200
    And the response property "url" should contain "/postcards/11111111-2222-4333-8444-555555555555.jpg"

  Scenario: The prompt names the city and asks for English lettering
    Given OpenAI draws the postcard
    When I ask for a postcard of "Kraków"
    Then the response status should be 200
    And the prompt sent to OpenAI should contain 'TARGET_CITY = "Kraków"'
    And the prompt sent to OpenAI should contain "Set the exact city name TARGET_CITY in uppercase"
    And the prompt sent to OpenAI should contain "All text and lettering must be in English."

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

  Scenario: A second uuid reuses the drawing and stores it again
    Given OpenAI draws the postcard
    When I ask for a postcard of "Munich" as "11111111-2222-4333-8444-555555555555"
    And I ask for a postcard of "Munich" as "99999999-8888-4777-8666-555555555555"
    Then the response status should be 200
    And OpenAI should have been asked to draw 1 time
    And the bucket should have been asked to store 2 times
    And the postcard should have been stored at "/mypreflight-postcards/postcards/99999999-8888-4777-8666-555555555555.jpg"

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
