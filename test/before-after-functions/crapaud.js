const file = require('@quenk/noni/lib/io/file');

module.exports = {

    "tests": [

        {
            "path": "test.js",

            "browser": "chrome",

            "url": "http://localhost:8080",

            "injectMocha": true,

            "before": [

                ()=> file.writeFile(`${__dirname}/BEFORE`, 'before')

            ],

            "after": [

                ()=> file.writeFile(`${__dirname}/AFTER`, 'after')

            ],

        }

    ]

}
