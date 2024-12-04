import json from '@rollup/plugin-json';
import pkg from './package.json' with {type: 'json'};

export default [
        // CommonJS (for Node) and ES module (for bundlers) build.
        {
                input: 'logger.js',
                external: ['@aws-sdk/client-cloudwatch-logs', 'util'],
                output: [
                        { file: pkg.main, format: 'cjs' },
                        { file: pkg.module, format: 'es' }
                ],
                plugins: [
                        json()
                ]
        }
];
