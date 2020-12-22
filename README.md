
# Crapaud

## Introduction

Tool for running tests against Single Page Applications.

This module provides an executable for executing mocha tests for a Single Page
Application via the Selenium Web Driver. It works by injecting the contents of
a test file into the page of the running application.

## Installation

In order to use this you must have the [appropriate driver installed][1] for your
target browser. Currently we only support Firefox and Chrome.

Install via npm:

```sh
npm install --save-dev @quenk/crapaud
```

## Usage

As of version `0.1.0`, this script accepts a path to a `crapaud.json` which
describes a suite of tests to execute.

This file must be a valid json object with the following structure:

|  Property    | Description |
|--------------|-------------|
| browser      | A string indicating which browser to run tests in (optional).     |
| url          | A string specifying the url you want the tests to be injected in  |
|              | (optional).                                                       |
| injectMocha  | If true, a mochajs bundle will be also be injected (default: true)|
| before       | An array of relative paths to scripts that will be executed before|
|              | tests are run (optional).                                         |
| beforeEach   | Like before, but is executed before each individual test.         |
| after        | An array of relative paths to scripts that will be executed after |
|              | tests are run (optional).                                         |
| afterEach    | Like after, but is executed before each individual test(optional).|
| keepOpen     | If true, will not attempt to close the browser after each test    |
|              | (optional).                                                       |
| tests        | And array of tests to be executed, see the table below for more   |
|              | info.                                                             |
|              |                                                                   |

Tests inherit some of their properties from the top level of the file, however the
values specified in a test take precedence.
Each test can be configured as follows:

|  Property    | Description |
|--------------|-------------|
| path         | The path to the test file to inject.                              |
| browser      | Same as top level propery.                                        |
| url          | Same as top level propery.                                        |
| injectMocha  | Same as top level propery.                                        |
| before       | An array of relative paths to scripts that will be executed before|
|              | tests are run (not inherited).                                    |
| after        | An array of relative paths to scripts that will be executed after |
|              | tests are run (not inherited).                                    |
| keepOpen     | Same as top level propery.                                        |
|              |                                                                   |

## License

Apache 2.0

(c) 2020 Quenk Technologies Limited

[1]:https://www.selenium.dev/documentation/en/webdriver/driver_requirements/#quick-reference
