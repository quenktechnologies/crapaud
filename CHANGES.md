# Crapaud Changelog

## [0.5.0] - 2021-03-28

### Changed
  - Transform can now be a function.

## [0.4.0] - 2021-03-27

### Changed
  - Conf files can now be js. They will be parsed via `require()` instead of 
    `JSON.parse`.
  - The test level before and after scripts can now be a function that will be
    called instead. See `ScriptFunc` for details.

## [0.3.0] - 2020-12-24

### Added
 - Path can be a directory with a crapaud.json file instead.
 - The `include` suite setting that will allow other suites to be included in a
   run.

## [0.2.0] - 2020-12-23

### Added
- A transform property that allows a script to be transformed before injection.

## [0.1.0] - 2020-12-20

### Changed
- Tests are now executed from a `crapaud.json` file instead of cli arguments.
