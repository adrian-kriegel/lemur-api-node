## WARNING
This is a beta. Please use with care.

## lemur-api
Lemur checks body structure, sanitizes inputs and documents endpoints in your postman collection. You can also use lemur to provide your front end with a JSON based documentation to match client and server side validation of inputs or generate forms automatically.

```
npm install lemur-api
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

app.use(router.getRouter())

//add your favourite body parser
app.use(express.urlencoded({extended: false}))

app.listen(SERVER_PORT, () => console.log('Server running on port ' + SERVER_PORT) )

```
