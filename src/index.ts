import Express from "express"
import * as BodyParser from "body-parser"
import Morgan from "morgan"
import { Checker, isCheckError, Keys, TypeNumber, TypeString } from "typescript-checker"

const expressApp = Express()

expressApp.use(Morgan("dev"))
expressApp.use(BodyParser.json({ strict: false }))
expressApp.use(BodyParser.urlencoded({ extended: true }))
expressApp.disable("x-powered-by")

type CheckedRequestHandler<Request, B> = (
	request: Request,
	checked: B,
	response: Express.Response,
	next: Express.NextFunction,
) => void | Promise<void>

type RequestHandlerError<Request> = (request: Request, response: Express.Response, errors: string[]) => void

type TypedRequestHandler<Request> = (
	request: Request,
	response: Express.Response,
	next: Express.NextFunction,
) => void | Promise<void>

interface CheckedRequest {
	query?: object
	params?: object
	body?: object
	header?: object
}

const CheckRequestConvert = <R, B>(
	checker: Checker<CheckedRequest, B>,
	handler: CheckedRequestHandler<R, B>,
	handleError?: RequestHandlerError<R>,
): TypedRequestHandler<R> => (request, response, next) => {
	const result = checker(request)
	if (isCheckError(result)) {
		if (handleError) {
			return handleError(request, response, result[0])
		}

		return void response.status(400).send({ errors: result[0] })
	}
	return handler(request, result[1], response, next)
}

export type NonEmpty<Type> = [Type, ...Type[]]

type Method<Request> = {
	<N>(
		path: string,
		check: TypedRequestHandler<Request & Partial<N>>,
		...middleware: NonEmpty<TypedRequestHandler<N & Request>>
	): TypedRouter<Request>
	(path: string, middleware: TypedRequestHandler<Request>): TypedRouter<Request>
}

interface TypedRouter<Request> {
	child: (path: string) => TypedRouter<Request>
	use: (<N>(...middleware: TypedRequestHandler<Request & Partial<N>>[]) => TypedRouter<N & Request>) &
		(<N>(path: string, ...middleware: TypedRequestHandler<Request & Partial<N>>[]) => TypedRouter<N & Request>)
	get: Method<Request>
	put: Method<Request>
	post: Method<Request>
	patch: Method<Request>
	delete: Method<Request>
}

const Router = <Request>(): TypedRouter<Request> & Express.Router => {
	const router = Express.Router()
	const x = Object.assign(router, {
		child: (prefix: string) => {
			const sub = Router()
			router.use(prefix, sub)

			return sub
		},
	})

	return x as any
}

const defaultErrorHandler = (err: Error, res: Express.Response) => {
	console.error(err)
	res.status(500).end()
}

export type ErrorHandlerChecker = typeof ErrorHandlerChecked
export const ErrorHandlerChecked = <Request, B>(
	request: CheckedRequestHandler<Request, B>,
): CheckedRequestHandler<Request, B> => async (req, checked, res, next) => {
	try {
		await request(req, checked, res, next)
	} catch (err) {
		const errorHandler: any | undefined = (req as any).errorHandler
		if (errorHandler) {
			errorHandler(err)
		}

		defaultErrorHandler(err, res)
	}
}

export type ErrorHandler = typeof ErrorHandler
export const ErrorHandler = <Request>(request: TypedRequestHandler<Request>): TypedRequestHandler<Request> => async (
	req,
	res,
	next,
) => {
	try {
		await request(req, res, next)
	} catch (err) {
		const errorHandler: any | undefined = (req as any).errorHandler
		if (errorHandler) {
			errorHandler(err)
		}

		defaultErrorHandler(err, res)
	}
}

type Context = void

const router = Router<Context>()

router.post(
	"/user",
	CheckRequestConvert(
		Keys({
			body: Keys({
				name: TypeString,
				age: TypeNumber,
			}),
		}),
		ErrorHandlerChecked(async (ctx, { body: { name, age } }, res) => {
			// create user with name and age

			res.status(201).json({ id: 42, name, age })
		}),
	),
)
