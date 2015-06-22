'use strict';

var _ = require('lodash');

var r = require('rethinkdb');
var thinky = require('thinky')();
var type = thinky.type;

var User = thinky.createModel('User', {
	id  : type.string(),
	name: type.string(),
	email: type.string()
});

var Login = thinky.createModel('Login', {
	id         : type.string(),
	userId     : type.string(),
	accountId  : type.string(),
	provider   : type.string(),
	identifier : type.string()
});

Login.ensureIndex('identifier');

// Join the models
User.hasMany(Login, 'Logins', 'id', 'userId');
Login.belongsTo(User, 'user', 'userId', 'id');

module.exports = function(config, seneca_instance) {
	var seneca = seneca_instance || require('seneca')();

	// pass in a passport user profile. If the user exists, return
	// a new User object. If not, register the user and return the new User.
	seneca.addAsync({system: 'user', action: 'login'}, function(args) {

		var userId = null;
        var identifier = `${args.query.user.userdata.provider}-${args.query.user.userdata.id}`;

		return Login.getAll(identifier, {index: 'identifier'})
            .run()
            .then(login => login.length ? login : Promise.reject())
            .catch(function(err) {

                if (err) throw err;

                // not found? Create User and Login
                args.query.user.userdata.accountId = args.query.user.userdata.id;
                delete args.query.user.userdata.id;
                args.query.user.userdata.identifier = identifier;

                var login = new Login(args.query.user.userdata);
                var user = new User({ name: args.query.user.name });
                login.user = user;

                return login.saveAll()
                    // store the created userId
                    .then(function() { userId = user.id; });
            })
            // At this point we should have a valid login. Use it to get the
            // user so that we have a user wth a linked login rather than the reverse
            .then(login => User.get(_.get(login, '[0].userId') || userId).getJoin())
            .then(user => ({ success: true, user: user}));
	});

	seneca.addAsync({system: 'user', action: 'get'}, function(args) {
		return User.get(args.id).getJoin()
            .then(user => ({ success:true, user:user }))
	});

	return {
        koa: function() { return require('./seneca-user-koa')(seneca); }
    };
};
module.exports.koa = function(seneca) { return require('./seneca-user-koa')(seneca); };
