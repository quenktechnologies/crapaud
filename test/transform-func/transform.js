#!/bin/env node

let data = [];

process.stdin.on('data', chunk => { data.push(chunk) });

process.stdin.on('end', () => {

    let output = `describe('${process.argv[1]}', ()=> ${data.join('')})`;
    console.log(output);

});
