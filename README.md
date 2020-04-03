## Disclaimer
This project is not affiliated with Postman in any way. This is a beta. Please use with care. 

## lemur-api
Lemur checks body structure, sanitizes inputs and documents endpoints in your postman collection. You can also use lemur to provide your front end with a JSON based documentation to match client and server side validation of inputs or generate forms automatically.

```
npm install lemur-api
```

## Response structure
Lemur enforces a response structure similar to that of JSON-RPC 2.0. The main difference being that the error object is always defined. The result object will simply be ignored if error.code is not 200. Example response: 

```javascript
{
	"result": "Hello World",
	"error":
	{
		"code":200,
      		"msg":"success",
		"data":{}
	}
}
```

## Postman
See the example below on how to connect your Postman collection with lemur. 

To update your Postman collections:

```javascript
lemur.updateAllCollections()
```
or from the command line (once your application is running):
```
pr-ud
```
Keep in mind that the use of the first option may lead you to reaching your Postman API limits quite fast, especially when using nodemon.

## Body & Query
Lemur requires a body parser. Single parameters will then be parsed as outlined by the endpoint description. Parameters not included in the endpoint description will be ignored and will remain in req.body and req.query respectively. If a required parameter is missing or if a parameter does not fit the defined schema, the response will be rejected with a BAD_REQUEST error. Example:

```javascript

router.add(
{
	//[...]
	//see the example below on how to use add()
	
	params:
	{
		someObject:
		{
			//any json schema
			type: 'object'
		}
	},
	
	//will return "object" if someObject is a valid JSON object
	callback: (req) => { return typeof(req.body.someObject) }
})

```

## Files
Use the files property to make sure required files are present and that all files have the correct mime type. Make sure you use express-fileupload before adding any endpoint that makes use of the files property.

```javascript
//use express-fileupload before defining this endpoint
router.add(
{
	//[...] 
	//see the example below on how to use add()
	
	//define files
	files:
	{
		thumbnails:
		{
			description: 'Posters for the gallery.',
			mimetypes: ["image/png", "image/jpeg"],
			required: true
		},
	},
	callback: (req) =>
	{
		//do something with the uploaded files in here
		return req.files.thumbnails
	}
	
})
```


## Callback & callback chains
Every endpoint requires at least one callback. Callbacks are compatible with express callbacks but are wrapped in a try-catch block so that anything returned from the callback will be treated as the end of the callback chain and sent to the client. Any Exception thrown in a callback will also terminate the chain. To send an Exception to the client, use an APIError. Any other exception will be treated as an internal server error. Callbacks may be asynchronous.

Example callback chain: 

```javascript
[ requireLogin ,secondCallback, () => { return 'You are logged in!' } ]
```
Example with an APIError:


```javascript
function failedCallback(req, res, next)
{
	throw new lemur.APIError()
	.code(400)
	.msg('errormsg')
	.data({ foo: 'bar' })
} 
```

```javascript
function failedCallback2(req, res, next)
{
	//use a pre-defined error code
	throw lemur.ERRORS.BAD_REQUEST()
	.msg('errormsg')
	.data({ foo: 'bar' })
} 
```


## Example
The following example might seem like a lot of code but keep in mind that the options will only have to be defined once.

Run this example:
```
npm run example
```

```javascript

const lemur = require('lemur-api')

const express = require('express')

const SERVER_PORT = 1337

/**
	Create a new options preset to re-use across different files and routers

	Do this once in your project before creating any routers.
*/
lemur.options('internal-api',
{
	//provide lemur with your express version
	express: express,

	//provide lemur with host info for documentation purposes
	host: 'localhost',
	port: SERVER_PORT, 
	protocol: 'http',

	mountpath: '/',

	//default request methods if none is supplied in an endpoint definition
	method: ['POST'],

	//link up your postman collection
	postman: 
	{
		apikey: 'your postman api key here',
		collection_uid: 'uid of your postman collection'
	},

	//a list of schemas if you want to use $ref in your parameter definitions
	schemas: 
	{
		//...
	}
})

//create a new router using our defined options
//if you only use one router, you can also put the options in there directly
const router = new lemur.LemurRouter({ use: 'internal-api' })

//use the add function to add a new endpoint
router.add(
{
	//this endpoint will answer POST and GET requests
	method: ['POST', 'GET'],

	//express route string
	route: '/echo-date',

	//for documentation
	description: 'Returns a date as a stringified date object.',

	//outline the expected query parameters
	//to define body parameters, use "params" instead
	query: 
	{
		date: 
		{ 
			//a json schema for a date
			id: '/date',
			type: 'string',

			//the example will be the default value on postman
			example: '09/17/1997',

			//this is redundant and merely for the purpose of the example
			//since we use the process function to cast to Date anyway
			pattern: /^\d{1,2}\/\d{1,2}\/\d{4}$/,

			//we use the process function to turn the string into a Date object
			//if this throws an exception, the string is rejected
			//this is not standard for json schemas
			//the process function is not required
			process: (str) => 
			{
				let timestamp = Date.parse(str)

				if(!isNaN(timestamp))
				{
					return new Date(timestamp)

				}else
				{
					throw lemur.ERRORS.BAD_REQUEST()
					.msg('invalid date')
				}
			},

			//by default this is false. the request will fail if no date is provided
			required: true
		}
	},

	//express callback or array for a callback chain
	//return something to trigger res.send()
	//throw an APIError to send it to the client
	//any other exception will result in an internal server error being sent to the client
	callback: (req) =>
	{
		//just echo the parsed date
		return req.query.date
	}
})


//create an express app like normal
const app = express()

//add a body parser if your want to access req.body
app.use(express.urlencoded({extended: false}))

app.use(router.getRouter())

app.listen(SERVER_PORT, () => console.log('Server running on port ' + SERVER_PORT) )

```
