# gulp-i18n-preprocess

Preprocess Polymer templates and extract UI strings to JSON for build-time I18N with [i18n-behavior](https://github.com/t2ym/i18n-behavior)

![Build-Time I18N](https://raw.githubusercontent.com/wiki/t2ym/gulp-i18n-preprocess/BuildTimeI18nFlow.gif)

## Features

- Preprocess Polymer templates to replace hard-coded UI strings with {{annotated}} variables
- Extract hard-coded UI strings to JSON 
- Embed the JSON to the target preprocessed templates as default strings
- Export the JSON as files
- Scan custom element HTMLs for constructing repository for I18N target attributes
- Build-time functionalities in [gulp-i18n-preprocess](https://github.com/t2ym/gulp-i18n-preprocess) are in sync with those in [i18n-behavior](https://github.com/t2ym/i18n-behavior) at run-time

## Install

```
    npm install --save-dev gulp-i18n-preprocess
```

[Quick Tour](#quick-tour) with [polymer-starter-kit-i18n](https://github.com/t2ym/polymer-starter-kit-i18n)

## Workflow

Build tasks from source to dist:

### 1. Scan task

  - Scan source HTMLs for custom elements
  - Construct localizable attributes repository

### 2. Preprocess task

  - Preprocess source HTMLs
  - Extract UI texts to JSON as default
  - Replace them with {{annotations}}
  - Embed default texts in HTMLs as JSON
  - Externalize default texts to JSON files
  - Put them in dist

### 3. Leverage task with [gulp-i18n-leverage](https://github.com/t2ym/gulp-i18n-leverage) 

  - Update localized JSON files by merging differences in default JSON from the previous build
  - Put them in dist
  - Merge all the UI texts into bundles object

### 4. Bundles task with `fs.writeFileSync()`

  - Generate default bundled JSON file `bundle.json` from the bundles object
  - Generate per-locale bundled JSON files `bundle.*.json` from the bundles object
  - Put them in dist

### 5. Feedback task

  - Update default and localized JSON files in source to commit them later by a developer or a build system

## Usage

### Default options

Sample to show default options:

```javascript
    var gulp = require('gulp');
    var i18nPreprocess = require('gulp-i18n-preprocess');

    gulp.task('preprocess', function () {
      // default options values
      var options = {
        replacingText: false, // does not replace strings with {{annotations}}
        jsonSpace: 2, // JSON stringification parameter for formatting
        srcPath: 'app', // base source path
        force: false, // does not force preprocessing when i18n-behavior.html is not imported
        dropHtml: false, // drop the preprocessed HTML for output
        constructAttributesRepository: false, // does not construct localizable attributes repository
        attributesRepositoryPath: null // does not specify the path to i18n-attr-repo.html
      };

      return gulp.src([ 'app/elements/**/*.html' ])
        .pipe(i18nPreprocess(options))
        .pipe(gulp.dest('dist/elements'));
    });
```

### Scan task

#### Note: Target HTMLs must import [i18n-behavior.html](https://github.com/t2ym/i18n-behavior) directly.

#### Input: 
  - Custom element HTMLs in source

#### Output: 
  - attributesRepository object in gulpfile.js

```javascript
    var gulp = require('gulp');
    var i18nPreprocess = require('gulp-i18n-preprocess');

    // Global object to store localizable attributes repository
    var attributesRepository = {};

    // Scan HTMLs and construct localizable attributes repository
    gulp.task('scan', function () {
      return gulp.src([ 'app/elements/**/*.html' ]) // input custom element HTMLs
        .pipe(i18nPreprocess({
          constructAttributesRepository: true, // construct attributes repository
          attributesRepository: attributesRepository, // output object
          srcPath: 'app', // path to source root
          attributesRepositoryPath: 
            'bower_components/i18n-behavior/i18n-attr-repo.html', // path to i18n-attr-repo.html
          dropHtml: true // drop HTMLs
        })) 
        .pipe(gulp.dest('dist/elements')); // no outputs; dummy output path
    });
```

### Preprocess task

#### Note: Target custom element HTMLs must import [i18n-behavior.html](https://github.com/t2ym/i18n-behavior) directly.

#### Input: 
  - Custom element HTMLs
  - Non-custom-element HTMLs in source

#### Output: 
  - Preprocessed HTMLs and default JSON files in dist

```javascript
    var gulp = require('gulp');
    var merge = require('merge-stream');
    var i18nPreprocess = require('gulp-i18n-preprocess');

    // Global object to store localizable attributes repository
    var attributesRepository; // constructed attributes repository

    // Other standard pipes such as crisper / minification / uglification are omitted for explanation
    gulp.task('preprocess', function () {
      var elements = gulp.src([ 'app/elements/**/*.html' ]) // input custom element HTMLs
        .pipe(i18nPreprocess({
          replacingText: true, // replace UI texts with {{annotations}}
          jsonSpace: 2, // JSON format with 2 spaces
          srcPath: 'app', // path to source root
          attributesRepository: attributesRepository // input attributes repository
        })))
        .pipe(gulp.dest('dist/elements')); // output preprocessed HTMLs and default JSON files to dist

      var html = gulp.src([ 'app/**/*.html', '!app/{elements,test}/**/*.html' ]) // non-custom-element HTMLs
        .pipe(i18nPreprocess({
          replacingText: true, // replace UI texts with {{annotations}}
          jsonSpace: 2, // JSON format with 2 spaces
          srcPath: 'app', // path to source root
          force: true, // force processing even without direct i18n-behavior.html import
          attributesRepository: attributesRepository // input attributes repository
         }))
        .pipe(gulp.dest('dist'));

      return merge(elements, html)
        .pipe($.size({title: 'copy'}));
    });
```

### Leverage task with [gulp-i18n-leverage](https://github.com/t2ym/gulp-i18n-leverage)

#### Input:
  - Current localized JSON files in source
  - Current default JSON files in source
  - Next default JSON files in dist

#### Output:
  - Next localized JSON files in dist
  - Bundles object in gulpfile.js

```javascript
    var gulp = require('gulp');
    var i18nLeverage = require('gulp-i18n-leverage');

    var bundles = {};

    gulp.task('leverage', function () {
      return gulp.src([ 'app/**/locales/*.json' ]) // input localized JSON files in source
        .pipe(i18nLeverage({
          jsonSpace: 2, // JSON format with 2 spaces
          srcPath: 'app', // path to source root
          distPath: 'dist', // path to dist root to fetch next default JSON files
          bundles: bundles // output bundles object
        }))
        .pipe(gulp.dest('dist')); // path to output next localized JSON files
    });
```

### Bundles task

#### Input: 
  - Bundles object in gulpfile.js

#### Output: 
  - Bundles JSON files in dist

```javascript
    var gulp = require('gulp');
    var fs = require('fs');
    var JSONstringify = require('json-stringify-safe');

    var bundles; // constructed bundles

    gulp.task('bundles', function (callback) {
      var DEST_DIR = 'dist';
      var localesPath = DEST_DIR + '/locales';

      try {
        fs.mkdirSync(localesPath);
      }
      catch (e) {}
      for (var lang in bundles) {
        bundles[lang].bundle = true;
        if (lang) {
          fs.writeFileSync(localesPath + '/bundle.' + lang + '.json', 
                            JSONstringify(bundles[lang], null, 2));
        }
        else {
          fs.writeFileSync(DEST_DIR + '/bundle.json', 
                            JSONstringify(bundles[lang], null, 2));
        }
      }
      callback();
    });
```

### Feedback task

#### Note: Target custom element HTMLs must import [i18n-behavior.html](https://github.com/t2ym/i18n-behavior) directly.

#### Input:
  - Next localized JSON files in dist
  - Custom element HTMLs
  - Non-custom-element HTMLs

#### Output:
  - Overwritten localized JSON files in source
  - Overwritten default JSON files in source

Outputs are ready to commit in the repository

```
    var gulp = require('gulp');
    var merge = require('merge-stream');
    var i18nPreprocess = require('gulp-i18n-preprocess');

    // Only applicable to development builds; Skip it in production builds
    gulp.task('feedback', function () {
      // Copy from dist
      var locales = gulp.src([ 'dist/**/locales/*.json', '!dist/locales/bundle.*.json'])
        .pipe(gulp.dest('app'));

      // Regenerate default JSON files
      var elementDefault = gulp.src([ 'app/elements/**/*.html' ])
        .pipe(i18nPreprocess({
          replacingText: false,
          jsonSpace: 2,
          srcPath: 'app',
          dropHtml: true,
          attributesRepository: attributesRepository
        }))
        .pipe(gulp.dest('app/elements'));

      // Regenerate default JSON files for non-custom-element HTMLs, i.e., i18n-dom-bind
      var appDefault = gulp.src([ 'app/**/*.html', '!app/{elements,test}/**/*.html' ])
        .pipe(i18nPreprocess({
          replacingText: false,
          jsonSpace: 2,
          srcPath: 'app',
          force: true,
          dropHtml: true,
          attributesRepository: attributesRepository
        }))
        .pipe(gulp.dest('app'));

      return merge(locales, elementDefault, appDefault)
        .pipe($.size({title: 'feedback'}));
    });
```

## API

`i18nPreprocess(options)`

### `options` object

- replacingText: Boolean, default: false - If true, UI texts are replaced with {{annotations}}
- jsonSpace: Number, default: 2 - JSON stringification parameter for formatting
- srcPath: String, default: 'app' - Path to source root
- force: Boolean, default: false - Force preprocessing even if i18n-behavior.html is not imported
- dropHtml: Boolean, default: false - If true, drop the preprocessed HTML for output
- constructAttributesRepository: Boolean, default: false - If true, construct localizable attributes repository
- attributesRepository: Object, default: {} - Input/Output - attributes respository object
- attributesRepositoryPath: String, default: null - Path to bower_components/i18n-behavior/i18n-attr-repo.html

## Quick Tour

### Quick demo deployment

```
    git clone https://github.com/t2ym/polymer-starter-kit-i18n.git
    cd polymer-starter-kit-i18n
    npm install -g gulp bower # if missing
    npm install && bower install
    # Development build with scan/preprocess/leverage/bundle/feedback tasks
    gulp --dev
    # Run-time I18N demo on http://localhost:5000
    gulp serve
    # Build-time I18N demo on http://localhost:5001
    gulp serve:dist --dev
```

### Change language on the demo

##### 1. Press F12 to open debugger console on the browser

##### 2. Navigate to the elements or DOM tab in the debugger

##### 3. Change `lang` attribute of `html` element from "en" to "ja" or "fr"

```
    <html lang="ja">
```

### Update UI strings on the demo

##### 1. Change any UI strings in the following HTMLs

```
    polymer-starter-kit-i18n/app/index.html
                                /elements/my-greeting/my-greeting.html
                                /elements/my-list/my-list.html
```

##### 2. Merge changes into JSON files

```
    cd polymer-starter-kit-i18n
    gulp --dev
```

##### 3. Check diffs

```
    git diff app
```

## License

[BSD-2-Clause](https://github.com/t2ym/gulp-i18n-preprocess/blob/master/LICENSE.md)
