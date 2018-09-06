import { WebClient } from '@slack/client'
import { XRay } from 'aws-sdk'
import { GetTraceSummariesRequest, TraceSummary } from 'aws-sdk/clients/xray'
import { chain, compact, flatMap, flatten, get, map } from 'lodash'

const region = process.env.AWS_REGION

const getTraceIds = async (xray: XRay, timePeriod) => {
  const params: GetTraceSummariesRequest = {
    EndTime: new Date(),
    StartTime: new Date(Date.now() - timePeriod),
    FilterExpression: 'Error',
  }

  let traceIds: TraceSummary[] = []

  while (true) {
    const response = await xray.getTraceSummaries(params).promise()

    traceIds = traceIds.concat((map(response.TraceSummaries, trace => trace.Id)))

    if (response.NextToken === null) {
      return traceIds
    }

    params.NextToken = response.NextToken
  }
}

const getTraces = async () => {
  const xray = new XRay({ region, apiVersion: '2016-04-12' })

  const timePeriod = 60 * 1000 * 5

  const traceIds = await getTraceIds(xray, timePeriod)

  const summaryResponses = await Promise.all(
    chain(traceIds)
      .chunk(5)
      .map(currentChunk => xray.batchGetTraces({ TraceIds: currentChunk }).promise())
      .value(),
  )

  return chain(summaryResponses)
    .map(response => response.Traces)
    .flatten()
    .value()
}

const extractExceptions = traces =>
  chain(traces)
    .flatMap(trace => flatMap(trace.Segments, (segment) => {
      const document = JSON.parse(segment.Document)

      if (document.cause && document.cause.exceptions) {
        return map(document.cause.exceptions, exception => ({
          exception,
          segment,
          trace,
          document,
        }))
      }
    }))
    .compact()
    .value()

const printStackTrace = (exception) => {
  return map(
    exception.stack,
    traceElement => `   at ${traceElement.label} (${traceElement.path}:${traceElement.line})`,
  ).join('\n')
}

const generateExceptionMessage = (exceptionData) => {
  return `Exception occured in *${exceptionData.document.name}*\`\`\`
${exceptionData.exception.message}
${printStackTrace(exceptionData.exception)} \`\`\``
}

const sendMessages = async (exceptionDatas) => {
  const web = new WebClient(process.env.SLACK_TOKEN)

  const ts = Number(new Date())

  await Promise.all(exceptionDatas.map((exceptionData) => {
    return web.chat.postMessage({
      ts,
      icon_emoji: ':fish:',
      channel: process.env.SLACK_CHANNEL as string,
      text: generateExceptionMessage(exceptionData),
      as_user: false,
      attachments: [
        {
          fallback: `Check trace at https://${region}.console.aws.amazon.com/xray/home?region=${region}#/traces/${exceptionData.trace.Id}`,
          actions: [
            {
              type: 'button',
              text: 'View Trace',
              url: `https://${region}.console.aws.amazon.com/xray/home?region=${region}#/traces/${exceptionData.trace.Id}`,
            },
          ],
        },
      ],
    })
  }))
}

export const reportExceptions = async () => {
  try {
    const traces = await getTraces()

    const exceptions = extractExceptions(traces)

    console.log(`There are ${exceptions.length} exceptions`)

    if (exceptions.length > 0) {
      await sendMessages(exceptions)
    }
  } catch (e) {
    console.log(e)
    throw e
  }
}
