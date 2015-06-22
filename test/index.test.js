"use strict";
var request = require('supertest'),
    koa     = require('koa'),
    mount   = require('koa-mount'),
    router  = require('koa-router'),
    Promise = require('bluebird'),
    chai    = require("chai"),
    sinon   = require("sinon"),
    expect  = chai.expect;

chai.use(require("sinon-chai"));

var senecaUserKoa = require('../index');

describe('seneca-user-koa', function() {

	var ctx = {
		session: {},
		state: {}
	};
	var senecaActStub = sinon.stub();
	var senecaMock    = { actAsync: senecaActStub };
	var app           = koa().use(senecaUserKoa(senecaMock));
	senecaActStub.returns(Promise.resolve({}));

	var testRouter = router()
		.get('/user/current', function * (next) {
			this.session = ctx.session;
			this.state = ctx.state;
			yield next;
		});

	var superApp  = koa()
		.use(testRouter.routes())
		.use(mount('/', app));
	superApp.keys = ['test'];

	describe('GET /user/current', function() {

		it('should give a 401 when there is no JWT', function(done) {

			ctx.state = {};

			request(superApp.listen())
				.get('/user/current')
				.expect(401)
				.end(done);
		});

		it('should call seneca with the correct system and action', function(done) {

			ctx.state = {
				jwt: { sub: 'SUB1' }
			};

			senecaActStub.reset();
			senecaActStub.returns({ success: false });
			request(superApp.listen())
				.get('/user/current')

				.end(function() {
					expect(senecaActStub.args[0][0].system).to.equal('user');
					expect(senecaActStub.args[0][0].action).to.equal('get');

					done();
				});
		});

		it('should call seneca with the user id from the JWT', function(done) {

			ctx.state = {
				jwt: { sub: 'SUB2' }
			};

			senecaActStub.reset();
			senecaActStub.returns({ success: false });
			request(superApp.listen())
				.get('/user/current')

				.end(function() {
					expect(senecaActStub.args[0][0].id).to.equal('SUB2');

					done();
				});
		});

		it('should give a 500 when the seneca response does not indicate success', function(done) {

			ctx.state = {
				jwt: { sub: 'SUB1' }
			};

			senecaActStub.reset();
			senecaActStub.returns({success: false});
			request(superApp.listen())
				.get('/user/current')
				.expect(500)
				.end(done);
		});

		it('should return the seneca response when successful', function(done) {

			ctx.state = {
				jwt: { sub: 'SUB1' }
			};

			senecaActStub.reset();
			senecaActStub.returns({ success: true, result: 'TEST' });
			request(superApp.listen())
				.get('/user/current')
				.expect(200)
				.end(function(err, res) {

					expect(res.body.result).to.equal('TEST');

					done();
				});
		});
	});
});
