module.exports = {
    packagerConfig: {
        name: 'PRISMA ATLAS',
        executableName: 'prisma-atlas',
        icon: './assets/icon',
        appBundleId: 'com.prisma-atlas.app',
        appCategoryType: 'public.app-category.productivity',
        asar: true,
        extraResource: [
            '../backend',
            './frontend-dist'
        ],
        ignore: [
            /node_modules\/\.cache/,
            /\.git/,
            /\.vscode/,
            /__pycache__/,
            /\.pyc$/
        ]
    },
    rebuildConfig: {},
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                name: 'prisma-atlas',
                setupIcon: './assets/icon.ico',
                iconUrl: 'https://raw.githubusercontent.com/Goriooooo/IPT2-Module1-Practical/main/assets/icon.ico'
            }
        },
        {
            name: '@electron-forge/maker-zip',
            platforms: ['darwin', 'linux']
        },
        // DMG maker disabled - requires icon.icns file in assets folder
        // {
        //     name: '@electron-forge/maker-dmg',
        //     config: {
        //         name: 'PRISMA ATLAS',
        //         icon: './assets/icon.icns',
        //         format: 'ULFO',
        //         overwrite: true,
        //         contents: [
        //             { x: 130, y: 220, type: 'file', path: './out/PRISMA ATLAS-darwin-arm64/PRISMA ATLAS.app' },
        //             { x: 410, y: 220, type: 'link', path: '/Applications' }
        //         ]
        //     }
        // },
        {
            name: '@electron-forge/maker-deb',
            config: {
                options: {
                    name: 'prisma-atlas',
                    productName: 'PRISMA ATLAS',
                    genericName: 'Pig Monitoring System',
                    icon: './assets/icon.png',
                    categories: ['Utility', 'Science'],
                    description: 'Piglet Realtime Identification and Sow Monitoring Assistant - AI-powered pig farrowing monitoring system',
                    maintainer: 'PRISMA ATLAS Team',
                    homepage: 'https://github.com/Goriooooo/IPT2-Module1-Practical'
                }
            }
        },
        {
            name: '@electron-forge/maker-rpm',
            config: {
                options: {
                    name: 'prisma-atlas',
                    productName: 'PRISMA ATLAS',
                    icon: './assets/icon.png',
                    categories: ['Utility', 'Science'],
                    description: 'Piglet Realtime Identification and Sow Monitoring Assistant'
                }
            }
        }
    ],
    plugins: [
        {
            name: '@electron-forge/plugin-auto-unpack-natives',
            config: {}
        }
    ]
};
