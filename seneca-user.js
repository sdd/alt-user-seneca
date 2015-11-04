'use strict';

var _ = require('lodash');

var r      = require('rethinkdb');
var thinky = require('thinky')();
var type   = thinky.type;

var User = thinky.createModel('User', {
	id    : type.string(),
	name  : type.string(),
	email : type.string(),
	avatar: type.string()
});

var Login = thinky.createModel('Login', {
	id        : type.string(),
	userId    : type.string(),
	accountId : type.string(),
	provider  : type.string(),
	identifier: type.string(),
	token     : type.string(),
	secret    : type.string()
});

User.ensureIndex('email');
Login.ensureIndex('identifier');

// Join the models
User.hasMany(Login, 'Logins', 'id', 'userId');
Login.belongsTo(User, 'user', 'userId', 'id');

function linkUser(login, user) {
	login.user = user;
	return login.saveAll()
		.then(() => user)
}

function formatLoginData(obj) {
	return Object.assign({}, obj.userdata, {
		identifier: `${obj.userdata.provider}-${obj.userdata.id}`,
		id        : undefined
	});
}

function formatUserData(obj) {
	const result = { name: obj.name };
	if (obj.userdata.emails && obj.userdata.emails.length) {
		result.email = obj.userdata.emails[0].value;
	}
	if (obj.userdata.photos && obj.userdata.photos.length) {
		result.avatar = obj.userdata.photos[0].value;
	}
	return result;
}

module.exports     = function(config, seneca_instance) {
	var seneca = seneca_instance || require('seneca')();

	// pass in a passport user profile. If the user exists, return
	// a new User object. If not, register the user and return the new User.
	seneca.addAsync({ system: 'user', action: 'login' }, function(args) {

		const loginData = formatLoginData(args.query.user);
		const userData  = formatUserData(args.query.user);

		return Login.getAll(loginData.identifier, { index: 'identifier' }).run()

			// login found? return it's user, or reject into catch
			.then(login => login.length ? User.get(login[0].userId).run() : Promise.reject())

			// login not found?
			.catch(function(err) {
				if (err) throw err;
				var login = new Login(loginData);

				// check for a User with the same email address
				if (userData.email) {
					return User.getAll(userData.email, { index: 'email' }).run()

						// user found with same email address? link and return it, or reject into catch
						.then(user => user.length ? user[0] : Promise.reject())
						.then(_.curry(linkUser)(login))

						// no user found with this email address? create one and link to created login
						.catch(function(err) {
							if (err) throw err;
							return linkUser(login, new User(userData));
						})

				} else {
					// no email address? create user and link to created login
					return linkUser(login, new User(userData));
				}
			})
			.then(user => ({ success: true, user }))
			.catch(err => ({ success: false, err }));
	});

	seneca.addAsync({ system: 'user', action: 'get' }, function(args) {
		return User.get(args.id)
			.run()
			.then(user => ({ success: true, user: user }))
	});

	return {
		koa: function() { return require('./seneca-user-koa')(seneca); }
	};
};
module.exports.koa = function(seneca) { return require('./seneca-user-koa')(seneca); };
