'use strict';
var _ = require('lodash');
var router = require('koa-router')();

module.exports = function(seneca) {

    router.get('/user/current', function* () {
        if (_.get(this, 'state.jwt.sub')) {
            var response = yield seneca.actAsync({
                system: 'user',
                action: 'get',
                id: this.state.jwt.sub
            });

            if (response.success) {
                return this.body = response;
            }
        }

        this.status = 500;
    });

    return router.middleware();
};
