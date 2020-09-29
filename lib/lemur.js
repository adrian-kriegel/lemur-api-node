'use strict'

const Validator = require('jsonschema').Validator

const cli 		= require('node-simple-cli')

const postman	= require('./postman')

const response 	= require('./APIResponse')

const baker 	= require('./schema-baker')

module.exports.APIError = response.APIError
module.exports.ERRORS = response.ERRORS
module.exports.onInternalError = response.onInternalError
const ERRORS = response.ERRORS

module.exports.updateAllCollections = postman.updateAllCollections

//all properties an api parameter may have in the end, all others are moved to schema
const PROPS_PARAM = 
[
	'description',
	'example',
	'schema',
	'required',
]

//all properties that are not required in production and merely serve the purpose of documentation
const PROPS_REMOVE_PRODUCTION =
[
	'descrtiption',
	'example'
]

//list of instances in order to perform operations on all of them at once
const instances = {}

var optionPresets = {}

/**
	Returns an error-object
*/
function error(err = {})
{
	console.error(new Error('Use of error(...) is deprecated.'))
	return new response.APIError(err.code, err.msg, err.data)
}
module.exports.error = error

/**
	Returns a API-Response object
*/	
function result(res, err)
{
	console.error(new Error('Use of result(...) is deprecated.'))
	return new response.APIResponse(res, err)
}
module.exports.result = result

/**
	Returns a response with just an error message
*/
function errRes(code, msg='', data={})
{
	console.error(new Error('Use of result(...) is deprecated.'))
	return new response.APIResponse(null, new response.APIError(code, msg, data))
}
module.exports.errRes = errRes


/**
	Checks a request for validity and parses body, query and files
*/
async function checkRequest(req, res, desc, validator)
{
	await checkParameters(req.body, desc.params, validator, req, res)
	await checkParameters(req.query, desc.query, validator, req, res)
	await checkFiles(req, desc)
}

/**
	Checks any parameter object (body,query,...) for validity and parses data
*/
function checkParameters(body, params, validator, req, res)
{
	if(params)
	{
		for(var name in params)
		{
			const param = params[name]

			var bodyparam = body[name]

			if(!(name in body))
			{
				if(param.required)
				{
					throw ERRORS.BAD_REQUEST()
					.msg('missing parameter: ' + name)
					.data(
						{
								param: name
						}
					)
				}

				continue
			}

			var invalidJSON = false
			var bodyparamJSON = bodyparam

			//parse the JSON if necessary
			if(param.schema.type != 'string')
			{
				try
				{
					bodyparamJSON = JSON.parse(bodyparam)

				}catch(e)
				{
					invalidJSON = true
				}
			}
			
			//TODO: throw APIError (see process() )
			if(param.schema.before)
					for(let i in param.schema.before)
						bodyparamJSON = param.schema.before[i](bodyparamJSON, req, res)

			//check if the schema matches
			const valres = validator.validate(bodyparamJSON, param.schema)
			
			if(valres.errors.length != 0)
			{
				throw ERRORS.BAD_REQUEST()
				.msg('schema error: ' + name)
				.data(
					{
						validationError: valres.errors,
						param: name
					}
				)
			}

			try
			{
				if(param.schema.process)
					for(let i in param.schema.process)
						bodyparamJSON = param.schema.process[i](bodyparamJSON, req, res)

				body[name] = bodyparamJSON

			}catch(e)
			{
				//add the parameter name to the exception
				//TODO: add the exception to an APIError
				e._data = e._data || {}
				
				if(typeof(e._data) === 'object')
				{
					e._data.param = name
				}
				
				//forward the exception to the error handler
				throw e
			}
		}

	}
}

/**
	Checks for required files and mime types
*/
function checkFiles(req, desc)
{
	if(desc.files)
	{
		if(!req.files) req.files = {}

		for(var fname in desc.files)
		{
			const file = desc.files[fname]
				
			//check if the file is required but missing form the request
			if(file.required && !(fname in req.files))
			{
				throw ERRORS.BAD_REQUEST()
				.msg('missing files: ' + fname)
				.data(
					{
						file: fname
					}
				)
			}
				
			//if the file is included in the request
			if((fname in req.files))
			{
				//if a single file is submitted, treat it as an array with one entry
				if(!Array.isArray(req.files[fname]))
				{
					req.files[fname] = [req.files[fname]]
				}

				var reqFiles = req.files[fname]

				//check the mime-type for every single file
				for(var i in reqFiles)
				{
					if(file.mimetypes && !file.mimetypes.includes(reqFiles[i].mimetype) )
					{
						throw ERRORS.BAD_REQUEST()
						.msg('invalid mimetypes: ' + fname)
						.data(
							{
								file: fname
							}
						)
					}
				}
			}
		}
	}
}

//used to create default options
module.exports.options = function(name, args)
{
	optionPresets[name] = args
}

cli.register('pr-ls', (args) =>
{
	if(!args)
		return Object.keys(instances)
	
	if(args in instances)
		return instances[args]

	return 'Invalid router specified. Type pr-ls for a list of routers.'
})


class LemurRouter
{
	/**
		Creates a new LemurRouter

		args.express is required
	*/
	constructor(args)
	{
		//use preset options
		if(args.use && optionPresets[args.use])
		{
			for(var key in optionPresets[args.use])
			{
				args[key] = key in args ? args[key] : optionPresets[args.use][key]
			}
		}

		this.name = this.createName(args.name || 'lemur')
		
		instances[this.name] = this

		this.folder = args.folder

		this.mountpath = args.mountpath || '/'

		this.host = args.host || process.env.HOSTNAME || ''

		this.port = args.port || process.env.SERVER_PORT || 80

		this.validator = new Validator()

		this.router = args.router || args.express.Router()

		this.endpoints = {}

		this.postman = args.postman

		this.protocol = args.protocol || 'http'

		this.enctype = args.enctype || 'application/x-www-form-urlencoded'

		this.method = args.method || 'GET'

		this.use = args.use || false

		if(args.schemas)
		{
			var schemas = args.schemas

			for(var i in schemas)
			{
				this.addSchema(schemas[i])
			}
		}

		if(this.postman && this.postman.collection_uid)
		{
			postman.addRouter(this)
		}
	}

	/**
		Creates a unique name for the router
		Results in lemur1 if lemur exists, lemur2 if lemur1 exists
	*/
	createName(name, counter = 0)
	{
		const newName = name + ( counter === 0 ? '' : counter)

		if(newName in instances)
		{
			return this.createName(name, counter + 1)

		}else
		{
			return newName
		}
	}

	/**
		Expose the express router
	*/
	getRouter() { return this.router }

	/**
		Adds a JSON-schema to the validator
	*/
	addSchema(schema, id = null)
	{
		this.validator.addSchema(schema, id || schema.id)
	}


	/**
		Re-shapes params object and applies inheritance
	*/
	initParams(params)
	{
		for(var p in params)
		{
			const param = params[p]

			//apply inheritance
			if(param.extends)
			{
				if(!Array.isArray(typeof(param.extends)))
				{
					param.extends = [param.extends]
				}

				for(var e in param.extends)
				{
					for(var ekey in param.extends[e])
					{
						if(!(ekey in param))
						{
							param[ekey] = param.extends[e][ekey]
						}
					}
				}
				//remove all inheritance statements
				delete param.extends
			}

			//if no schema is defined, the param itself is treated as the schema
					
			if(!param.schema)
			{
				param.schema = {}
			}

			//move everything that belongs in the schema to the schema
			for(let k in param)
			{
				if(!PROPS_PARAM.includes(k))
				{
					param.schema[k] = param[k]
					delete param[k]
				}
			}

			if(param.schema.process && !Array.isArray(param.schema.process))
				param.schema.process = [param.schema.process]

			if(param.schema.before && !Array.isArray(param.schema.before))	
				param.schema.before = [param.schema.before]

			this.clearUnused(param)
		}

		return params
	}

	/**
		Deletes all keys in PROPS_REMOVE_PRODUCTION to reduce memory usage in production
	*/
	clearUnused(obj)
	{
		//delete all unnecessary data in production to reduce memory usage
		if(this.production)
		{
			for(let name in PROPS_REMOVE_PRODUCTION)
			{
				delete params[name]
			}
		}
	}

	/**
		Adds an endpoint to the API
	*/
	add(desc)
	{
		if(!desc.enctype)
		{
			desc.enctype = this.enctype
		}

		desc.params = desc.params || {}
		desc.files = desc.files || {}

		this.initParams(desc.params)
		this.initParams(desc.query)

		//add a type attribute to files in order to display the information in the collection
		//also add allowed mimetypes to desctiption
		for(var fname in desc.files)
		{
			const file = desc.files[fname]

			file.type = 'file'

			file.description = (file.mimetypes || '["*"]') + ' ' + file.description
		}

		desc.method = desc.method || this.method

		var namesplit = (Array.isArray(desc.route) ? desc.route[0] : desc.route).split('/')

		desc.name = desc.name || namesplit[namesplit.length - 1]

		if(!this.production)
		{
			this.endpoints[desc.name] = desc
		}

		//turn method into array if it isn't one already
		if(!Array.isArray(desc.method))
		{
			desc.method = [desc.method]
		}

		//before executing the callbacks, make sure the specification is used correctly by the caller
		let parseRequest = async(req, res, next) =>
		{	
			try
			{
				await this.checkRequest(req, res, desc)

			}catch(e)
			{
				response.handleError(req, res, e)
				return
			}

			next()
		}

		for(var i in desc.method)
		{
			this.router[desc.method[i].toLowerCase()](desc.route, parseRequest)
		}

		if(!Array.isArray(desc.callback))
		{
			desc.callback = [desc.callback]
		}

		//add the callbacks one after another
		for(var i in desc.callback)
		{
			//wrap the callback in a try catch in order to filter out errors
			const callback = desc.callback[i].bind(desc)

			//function that tries executing the callback
			const tryCallback = async (req, res, next) =>
			{
				try
				{
					const result = await callback(req, res, next, desc)

					if(typeof(result) != 'undefined') 
					{
						res.send(new response.APIResponse(result))
					}

				}catch(e)
				{
					response.handleError(req, res, e)
				}
			}

			for(var i in desc.method)
			{
				this.router[desc.method[i].toLowerCase()](desc.route, tryCallback)
			}
		}
	}

	async checkRequest(req, res, desc)
	{
		return await checkRequest(req, res, desc, this.validator)
	}

	/**
		Throws exception or sends error to client depending on error type
	*/
	handleError(req, res, e)
	{
		//TODO: filter out proper error structure
		if(e instanceof Error)
		{
			console.error('Error in ' + req.route.path)
			console.error(e)
			
		}else
		{
			if(e.error)
			{
				if(!e.error.data)
					e.error.data = {}

				e.error.data.endpoint = req.originalUrl
			}
			res.send(e)
		}
	}

	getSchemas()
	{
		return this.validator.schemas
	}

}
module.exports.LemurRouter = LemurRouter


function bakeParams(method, path)
{
	let params = {}

	let query = {}

	//find the endpoint
	for(let i in instances)
	{
		let router = instances[i]

		for(let r in router.endpoints)
		{
			let ep = router.endpoints[r]

			if(
				//method matches
				ep.method.includes(method) && 
				(
					//route matches exactly
					ep.route === path 
					|| 
					//route express route with a *
					(path.startsWith(ep.route) && ep.route.endsWith('*'))
				)
			)
			{
				params = 
				{
					...params,
					...baker.bakeParams(ep.params, router.validator.schemas)
				}

				query = 
				{
					...query,
					...baker.bakeParams(ep.query, router.validator.schemas)
				}
			}
		}
	}

	return { params, query }
}
module.exports.bakeParams = bakeParams

/**
	Returns all route objects from all routes using any of the confignames
*/
function getAllDocs(confignames)
{
	const definitions = {}

	const endpoints = {}

	for(var i in instances)
	{
		const router = instances[i]

		Object.assign(definitions, router.getSchemas())

		if(!confignames || (router.use in confignames) )
		{
			for(var r in router.endpoints)
			{
				const endpoint = router.endpoints[r]
				
				endpoints[endpoint.route] = 
				{
					method: endpoint.method,
					params: endpoint.params,
					query: endpoint.query,
				}
			}
		}
	}

	return {

		definitions: definitions,
		endpoints: endpoints,

	}
}
module.exports.getAllDocs = getAllDocs