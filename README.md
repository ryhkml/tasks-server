<div align="center">
    <h1>
        <b>Tasks Server</b>
    </h1>
</div>

Tasks Server is an on-premise task management service designed to execute and distribute tasks efficiently. A task is essentially an object representing a resource intended for one-time use. You can request a task, and they will be executed at a later time.

<br>

<div align="center">
	<img src="./diagram.png" alt="Diagram Tasks Server">
</div>

## Features
1. HTTP requests with selected (http and https) curl options
2. Configurable retry mechanism
3. Custom scheduling options

There are two comparison tables that compare Pub/Sub and the Cron Job Scheduler.

### Tasks vs Pub/Sub

| **Feature** | **Tasks** | **Pub/Sub** |
|---|---|---|
| **Communication Model** | Message-to-queue | Publish-subscribe |
| **Scheduling** | Yes (one-time or recurring) | No |
| **Configurable Retries** | Yes | Yes |
| **Individual Task Management** | Yes | No |
| **Delivery Warranty** | Best (with retries) | At least once |
| **Delivery Rate Control** | Limited 1000 task in queue | Unlimited |
| **Use Cases** | Form submission, file processing, send notifications | Streaming data, asynchronous event processing |

### Tasks vs Cron Job Scheduler

| **Feature** | **Tasks** | **Cron Job Scheduler** |
|---|---|---|
| **Communication Model** | Message-to-queue | Message-to-job |
| **Scheduling** | Yes (one-time or recurring) | Yes (Cron-schedule fixed interval) |
| **Configurable Retries** | Yes | No |
| **Individual Task Management** | Yes | No |
| **Delivery Warranty** | Best (with retries) | No |
| **Delivery Rate Control** | Limited 1000 task in queue | No |
| **Use Cases** | Form submission, file processing, send notifications | Batch processing, cleanup processing, data synchronization |

## Getting Started
Make sure you have [bun](https://bun.sh/docs/installation) installed, run:
```sh
./init.sh
```

## Development
To start the development server, run:
```sh
bun run serve:dev
```

## Test
To start the test server, run:
```sh
bun run test
# Or test specifically the file name
bun test <FILENAME>
```

## Single-file executable
To compile single-file executable, run:
```sh
bun run bin
```

❌ ## Docker or Podman build

## Path configuration
You can use absolute path or current working path, for example:
```sh
# Absolute path
/tmp/tasks/tasks.db
# Current working path
./.database/tasks.db
```

## APIs
### Owner
- ✅ `GET /owners/:name`
- ✅ `DELETE /owners/:name`
- ✅ `POST /owners/register`

### Queue
- ✅ `GET /queues`
- ✅ `GET /queues/:id`
- ❌ `PATCH /queues/:id`
- ✅ `DELETE /queues/:id`
- ❌ `GET /queues/:id/config`
- ✅ `PATCH /queues/:id/pause`
- ✅ `PATCH /queues/:id/resume`
- ✅ `PATCH /queues/:id/revoke`
- ✅ `POST /queues/register`

❌ ## Documentation

To make it base64 content encoding, you can use the shell command
```sh
cat cert.pem | base64 -w 0
```
An example of requesting a task
```json
{
    "httpRequest": {
        "url": "https://dummyjson.com/todos/1",
        "method": "GET"
    },
    "config": {
        "executionDelay": 86400000,
        "retry": 5,
        "retryInterval": 3600000,
        "retryExponential": false
    }
}
```
```sh
curl -X POST \
    -H "authorization: Bearer <KEY>" \
    -H "content-type: application/json" \
    -H "x-tasks-owner-id: <ID>" \
    -d @body.json \
    http://localhost:9220/queues/register
```
The response
```json
{
	"id": "...",
    "state": "RUNNING",
    "createdAt": "...",
    "expiredAt": 0,
    "statusCode": 0,
    "estimateEndAt": 0,
    "estimateExecutionAt": "...",
	"response": null
}
```

The example above, the task will be executed after waiting for 1 day. If the task receives a 4xx-5xx error response, it will be run again 5 times with a 1-hour interval between each execution. If `retryExponential = true`, the interval between each execution will increase

```txt
retryInterval = 3600000ms

Retry-1: 3600000 * 1 = 3600000ms
Retry-2: 3600000 * 2 = 7200000ms
Retry-3: 3600000 * 3 = 10800000ms

And so on...
```
Additionally, you can make a specific request by using `executeAt`
```json
{
    "httpRequest": {
        "url": "https://dummyjson.com/todos/1",
        "method": "GET"
    },
    "config": {
        "executeAt": 1355245932000
    }
}
```
or
```json
{
    "httpRequest": {
        "url": "https://dummyjson.com/todos/1",
        "method": "GET"
    },
    "config": {
        "executeAt": "Dec 12 2012 12:12:12 AM"
    }
}
```
```sh
curl -X POST \
    -H "authorization: Bearer <KEY>" \
    -H "content-type: application/json" \
    -H "x-tasks-owner-id: <ID>" \
    -d @req.json \
    http://localhost:3200/queues/register
```
> [!NOTE]
>
> Properties ending with `"At"` are in UNIX time format `executeAt`, `retryAt`, and `timeoutAt`.
> 
> `retryAt` is the same as `retry = 1` with a specific time.
> 
> `timeoutAt` will be executed only once. If the task has been retried several times, then it will continue using `timeout`.

To find out milliseconds in various programming languages, you can visit [currentmillis.com](https://currentmillis.com) and remember to set the environment variable `TZ=UTC` on the Tasks Server.

❌ ## SQLite Backup