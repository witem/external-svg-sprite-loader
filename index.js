'use strict';

const imagemin = require('imagemin');
const imageminSvgo = require('imagemin-svgo');
const loaderUtils = require('loader-utils');

const SvgStorePlugin = require('./lib/SvgStorePlugin');

/**
 * Default values for every param that can be passed in the loader query.
 * @const
 * @type {Object}
 */
const DEFAULT_QUERY_VALUES = {
    name: 'img/sprite.svg',
    iconName: 'icon-[name]-[hash:5]',
    svgoOptions: {
        plugins: [
            { collapseGroups: true },
            { convertPathData: true },
            { convertStyleToAttrs: true },
            { convertTransform: true },
            { removeDesc: true },
            { removeViewBox: false },
            { removeDimensions: true },
        ],
    },
};

/**
 * Applies SVGO on the SVG file in order to optimize its contents and remove unnecessary attributes for the sprite.
 * Registers the SVG on the Sprites store so that the plugin has access to them.
 * Generates SVG metadata to be passed to JavaScript and CSS files so that the symbols can be rendered.
 * @param {Buffer} content - the content of the SVG file.
 */
function loader(content) {
    const { addDependency, resourcePath } = this;

    // Get callback because the SVG is going to be optimized and that is an async operation
    const callback = this.async();

    // Parse the loader query and apply the default values in case no values are provided
    const query = Object.assign({}, DEFAULT_QUERY_VALUES, loaderUtils.getOptions(this));

    // Get the sprite
    const sprite = SvgStorePlugin.getSprite(query.name);

    // Add the icon as a dependency
    addDependency(resourcePath);

    // Start optimizing the SVG file
    imagemin
        .buffer(content, {
            plugins: [
                imageminSvgo(query.svgoOptions),
            ],
        })
        .then((content) => {

            // Create the icon name with the hash of the optimized content
            const iconName = loaderUtils.interpolateName(this, query.iconName, { content });

            // Register the sprite and icon
            const icon = sprite.addIcon(resourcePath, iconName, content.toString());

            // Export the icon as a metadata object that contains urls to be used on an <img/> in HTML or url() in CSS
            // If the outputted file is not hashed and to support hot module reload, we must force the browser
            // to re-download the sprite on subsequent compilations
            // We do this by adding a cache busting on the URL, with the following pattern: img/sprite.svg?icon-abcd#icon-abcd
            // It's important that the cache busting is not included initially so that it plays well with server-side rendering,
            // otherwise many view libraries will complain about mismatches during rehydration (such as React)
            const hasSamePath = sprite.originalResourcePath === sprite.resourcePath;

            setImmediate(() => {
                callback(
                    null,
                    `var publicPath = ${query.publicPath ? `'${query.publicPath}'` : '__webpack_public_path__'};
                    var symbolUrl = '${icon.getUrlToSymbol()}';
                    var viewUrl = '${icon.getUrlToView()}';

                    ${process.env.NODE_ENV !== 'production' && hasSamePath ? `
                        var addCacheBust = typeof document !== 'undefined' && document.readyState === 'complete';
    
                        if (addCacheBust) {
                            symbolUrl = '${icon.getUrlToSymbol(true)}';
                            viewUrl = '${icon.getUrlToView(true)}';
                        }
                    ` : '' }

                    module.exports = {
                        symbol: publicPath + symbolUrl,
                        view: publicPath + viewUrl,
                        viewBox: '${icon.getDocument().getViewBox()}',
                        title: '${icon.getDocument().getTitle()}',
                        toString: function () {
                            return JSON.stringify(this.view);
                        }
                    };`
                );
            });
        })
        .catch((err) => {
            setImmediate(() => callback(err));
        });
}

loader.raw = true;

module.exports = loader;
