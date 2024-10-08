/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

// The compiler is needed as tests are in JIT.
/* eslint-disable import/no-unassigned-import */
import '@angular/compiler';
/* eslint-enable import/no-unassigned-import */

import { Component } from '@angular/core';
import { extractRoutesAndCreateRouteTree } from '../../src/routes/ng-routes';
import { PrerenderFallback, RenderMode } from '../../src/routes/route-config';
import { setAngularAppTestingManifest } from '../testing-utils';

describe('extractRoutesAndCreateRouteTree', () => {
  const url = new URL('http://localhost');

  @Component({
    standalone: true,
    selector: 'app-dummy-comp',
    template: `dummy works`,
  })
  class DummyComponent {}

  it('should extract routes and create a route tree', async () => {
    setAngularAppTestingManifest(
      [
        { path: '', component: DummyComponent },
        { path: 'home', component: DummyComponent },
        { path: 'redirect', redirectTo: 'home' },
        { path: 'user/:id', component: DummyComponent },
      ],
      [
        { path: 'home', renderMode: RenderMode.Client },
        { path: 'redirect', renderMode: RenderMode.Server, status: 301 },
        { path: '**', renderMode: RenderMode.Server },
      ],
    );

    const { routeTree, errors } = await extractRoutesAndCreateRouteTree(url);
    expect(errors).toHaveSize(0);
    expect(routeTree.toObject()).toEqual([
      { route: '/', renderMode: RenderMode.Server },
      { route: '/home', renderMode: RenderMode.Client },
      { route: '/redirect', renderMode: RenderMode.Server, status: 301, redirectTo: '/home' },
      { route: '/user/:id', renderMode: RenderMode.Server },
    ]);
  });

  it('should handle invalid route configuration path', async () => {
    setAngularAppTestingManifest(
      [{ path: 'home', component: DummyComponent }],
      [
        // This path starts with a slash, which should trigger an error
        { path: '/invalid', renderMode: RenderMode.Client },
      ],
    );

    const { errors } = await extractRoutesAndCreateRouteTree(url);
    expect(errors[0]).toContain(
      `Invalid '/invalid' route configuration: the path cannot start with a slash.`,
    );
  });

  it('should handle route not matching server routing configuration', async () => {
    setAngularAppTestingManifest(
      [
        { path: 'home', component: DummyComponent },
        { path: 'about', component: DummyComponent }, // This route is not in the server configuration
      ],
      [
        { path: 'home', renderMode: RenderMode.Client },
        // 'about' route is missing here
      ],
    );

    const { errors } = await extractRoutesAndCreateRouteTree(url);
    expect(errors[0]).toContain(
      `The '/about' route does not match any route defined in the server routing configuration.`,
    );
  });

  describe('when `invokeGetPrerenderParams` is true', () => {
    it('should resolve parameterized routes for SSG and add a fallback route if fallback is Server', async () => {
      setAngularAppTestingManifest(
        [{ path: 'user/:id/role/:role', component: DummyComponent }],
        [
          {
            path: 'user/:id/role/:role',
            renderMode: RenderMode.Prerender,
            fallback: PrerenderFallback.Server,
            async getPrerenderParams() {
              return [
                { id: 'joe', role: 'admin' },
                { id: 'jane', role: 'writer' },
              ];
            },
          },
        ],
      );

      const { routeTree, errors } = await extractRoutesAndCreateRouteTree(url, undefined, true);
      expect(errors).toHaveSize(0);
      expect(routeTree.toObject()).toEqual([
        { route: '/user/joe/role/admin', renderMode: RenderMode.Prerender },
        {
          route: '/user/jane/role/writer',
          renderMode: RenderMode.Prerender,
        },
        { route: '/user/:id/role/:role', renderMode: RenderMode.Server },
      ]);
    });

    it('should resolve parameterized routes for SSG and add a fallback route if fallback is Client', async () => {
      setAngularAppTestingManifest(
        [
          { path: 'home', component: DummyComponent },
          { path: 'user/:id/role/:role', component: DummyComponent },
        ],
        [
          {
            path: 'user/:id/role/:role',
            renderMode: RenderMode.Prerender,
            fallback: PrerenderFallback.Client,
            async getPrerenderParams() {
              return [
                { id: 'joe', role: 'admin' },
                { id: 'jane', role: 'writer' },
              ];
            },
          },
          { path: '**', renderMode: RenderMode.Server },
        ],
      );

      const { routeTree, errors } = await extractRoutesAndCreateRouteTree(url, undefined, true);
      expect(errors).toHaveSize(0);
      expect(routeTree.toObject()).toEqual([
        { route: '/home', renderMode: RenderMode.Server },
        { route: '/user/joe/role/admin', renderMode: RenderMode.Prerender },
        {
          route: '/user/jane/role/writer',
          renderMode: RenderMode.Prerender,
        },
        { route: '/user/:id/role/:role', renderMode: RenderMode.Client },
      ]);
    });

    it('should resolve parameterized routes for SSG and not add a fallback route if fallback is None', async () => {
      setAngularAppTestingManifest(
        [
          { path: 'home', component: DummyComponent },
          { path: 'user/:id/role/:role', component: DummyComponent },
        ],
        [
          {
            path: 'user/:id/role/:role',
            renderMode: RenderMode.Prerender,
            fallback: PrerenderFallback.None,
            async getPrerenderParams() {
              return [
                { id: 'joe', role: 'admin' },
                { id: 'jane', role: 'writer' },
              ];
            },
          },
          { path: '**', renderMode: RenderMode.Server },
        ],
      );

      const { routeTree, errors } = await extractRoutesAndCreateRouteTree(url, undefined, true);
      expect(errors).toHaveSize(0);
      expect(routeTree.toObject()).toEqual([
        { route: '/home', renderMode: RenderMode.Server },
        { route: '/user/joe/role/admin', renderMode: RenderMode.Prerender },
        {
          route: '/user/jane/role/writer',
          renderMode: RenderMode.Prerender,
        },
      ]);
    });
  });

  it('should not resolve parameterized routes for SSG when `invokeGetPrerenderParams` is false', async () => {
    setAngularAppTestingManifest(
      [
        { path: 'home', component: DummyComponent },
        { path: 'user/:id/role/:role', component: DummyComponent },
      ],
      [
        {
          path: 'user/:id/role/:role',
          renderMode: RenderMode.Prerender,
          async getPrerenderParams() {
            return [
              { id: 'joe', role: 'admin' },
              { id: 'jane', role: 'writer' },
            ];
          },
        },
        { path: '**', renderMode: RenderMode.Server },
      ],
    );

    const { routeTree, errors } = await extractRoutesAndCreateRouteTree(url, undefined, false);
    expect(errors).toHaveSize(0);
    expect(routeTree.toObject()).toEqual([
      { route: '/home', renderMode: RenderMode.Server },
      { route: '/user/:id/role/:role', renderMode: RenderMode.Server },
    ]);
  });
});
