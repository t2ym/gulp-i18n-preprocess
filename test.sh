#!/bin/sh
./node_modules/.bin/istanbul cover ./node_modules/mocha/bin/_mocha --report lcov -- -R spec
cat ./coverage/lcov.info | ./node_modules/coveralls/bin/coveralls.js