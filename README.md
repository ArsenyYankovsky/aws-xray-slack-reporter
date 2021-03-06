# aws-xray-slack-reporter

Simple AWS lambda that runs every 5 minutes and reports all AWS X-Ray exceptions for the last 5 minutes to a specified Slack channel.

# Setup

1) Create a Slack app (https://api.slack.com/slack-apps)
2) Add the app to your workspace and add `chat:write:bot` permission
3) Clone the repo and install dependencies by running either `yarn` or `npm i`.
4) Put your oAuth access token and channel id to the respective environment variables in the `serverless.yml` file
5) Make sure you have the correct region set in the `serverless.yml`. It will only report exceptions from the same region.
6) Run `sls deploy`. If you don't have Serverless cli installed, use following npm command to install it:
```
npm install -g serverless
```

# Limitations

1) The lambda will only report exceptions from AWS X-Ray in the same AWS region it is deployed.
2) It will also only report exceptions that are reported in a segment. It will not report exceptions from subsegments. To do that you'll need to modify the `extractExceptions` function to recursively traverse segments tree.

