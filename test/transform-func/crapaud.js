const {pure} = require('@quenk/noni/lib/control/monad/future');

module.exports = {

    "tests": [

        {
            "path": "test.js",

            "browser": "chrome",

            "url": "http://localhost:8080",

            "injectMocha": true,

            "transform": (_,src)=>
             pure(`describe('should use transform function', ()=> ${src})`)

        }

    ]

}
