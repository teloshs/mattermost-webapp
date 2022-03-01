// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// ***************************************************************
// - [#] indicates a test step (e.g. # Go to a page)
// - [*] indicates an assertion (e.g. * Check the title)
// - Use element ID when selecting an element. Create one if none.
// ***************************************************************

// Stage: @prod
// Group: @channel @rhs @channel_info

import {stubClipboard} from '../../utils';

describe('Channel Info RHS', () => {
    let testTeam;
    let testChannel;
    let groupChannel;
    let directUser;
    let admin;
    let user;

    before(() => {
        cy.apiInitSetup({promoteNewUserAsAdmin: true}).then(({team, user: newAdmin}) => {
            testTeam = team;
            admin = newAdmin;

            cy.apiCreateChannel(testTeam.id, 'channel', 'Public Channel', 'O').then(({channel}) => {
                testChannel = channel;
                cy.apiAddUserToChannel(channel.id, newAdmin.id);
            });

            // User we'll use for our permissions tests
            cy.apiCreateUser().then(({user: newUser}) => {
                cy.apiAddUserToTeam(team.id, newUser.id);
                user = newUser;
            });

            // Users used for GM/DM
            cy.apiCreateUser().then(({user: newUser}) => {
                cy.apiAddUserToTeam(team.id, newUser.id);

                cy.apiCreateDirectChannel([newAdmin.id, newUser.id]).then(() => {
                    directUser = newUser;
                });

                cy.apiCreateUser().then(({user: newUser2}) => {
                    cy.apiAddUserToTeam(team.id, newUser.id);
                    cy.apiCreateGroupChannel([newAdmin.id, newUser.id, newUser2.id]).then(({channel}) => {
                        groupChannel = channel;
                    });
                });
            });

            // # Change permission so that regular users can't change channels or add members
            cy.apiGetRolesByNames(['channel_user']).then(({roles}) => {
                const role = roles[0];
                const permissions = role.permissions.filter((permission) => {
                    return !(['manage_public_channel_members', 'manage_private_channel_members', 'manage_public_channel_properties', 'manage_private_channel_properties'].includes(permission));
                });

                if (permissions.length !== role.permissions) {
                    cy.apiPatchRole(role.id, {permissions});
                }
            });

            cy.apiLogin(admin);
        });
    });

    it('should be able to open the RHS', () => {
        // # Go to test channel
        cy.visit(`/${testTeam.name}/channels/${testChannel.name}`);

        // # Click on the channel info button
        cy.get('#channel-info-btn').click();

        // * RHS Container shoud exist
        cy.get('#rhsContainer').then((rhsContainer) => {
            cy.wrap(rhsContainer).findByText('Info').should('be.visible');
            cy.wrap(rhsContainer).findByText(testChannel.display_name).should('be.visible');
        });
    });

    describe('regular channel', () => {
        describe('top buttons', () => {
            it('should be able to toggle favorite on a channel', () => {
                // # Go to test channel
                cy.visit(`/${testTeam.name}/channels/${testChannel.name}`);

                // # Click on the channel info button
                cy.get('#channel-info-btn').click();

                // * Verify that we can toggle the favorite status
                cy.uiGetRHS().findByText('Favorite').should('be.visible').click();
                cy.uiGetRHS().findByText('Favorited').should('be.visible').click();
                cy.uiGetRHS().findByText('Favorite').should('be.visible');
            });

            it('should be able to toggle mute on a channel', () => {
                // # Go to test channel
                cy.visit(`/${testTeam.name}/channels/${testChannel.name}`);

                // # Click on the channel info button
                cy.get('#channel-info-btn').click();

                // * Verify that we can toggle the mute status
                cy.uiGetRHS().findByText('Mute').should('be.visible').click();
                cy.uiGetRHS().findByText('Muted').should('be.visible').click();
                cy.uiGetRHS().findByText('Mute').should('be.visible');
            });

            it('should be able to add people', () => {
                // # Go to test channel
                cy.visit(`/${testTeam.name}/channels/${testChannel.name}`);

                // # Click on the channel info button
                cy.get('#channel-info-btn').click();

                // * Verify that the modal appears
                cy.uiGetRHS().findByText('Add People').should('be.visible').click();
                cy.get('.channel-invite').should('be.visible');
            });

            it('should NOT be able to add people without permission', () => {
                // # Login as simple user
                cy.apiLogout();
                cy.apiLogin(user);

                // # Go to test channel
                cy.visit(`/${testTeam.name}/channels/${testChannel.name}`);

                // # Click on the channel info button
                cy.get('#channel-info-btn').click();

                // * Verify that the modal appears
                cy.uiGetRHS().findByText('Add People').should('not.exist');

                // # log back in as admin
                cy.apiLogout();
                cy.apiLogin(admin);
            });

            it('should be able to copy link', () => {
                // # Go to test channel
                cy.visit(`/${testTeam.name}/channels/${testChannel.name}`);

                stubClipboard().as('clipboard');

                // # Click on the channel info button
                cy.get('#channel-info-btn').click();

                // * Verify initial state
                cy.get('@clipboard').its('contents').should('eq', '');

                // # Click on "Copy Link"
                cy.uiGetRHS().findByText('Copy Link').parent().should('be.visible').trigger('click');

                // * Text should change to Copied
                cy.uiGetRHS().findByText('Copied').should('be.visible');

                // * Verify if it's called with correct link value
                cy.get('@clipboard').its('contents').should('eq', `${Cypress.config('baseUrl')}/${testTeam.name}/channels/${testChannel.name}`);
            });
        });
        describe('about area', () => {
            it('should display purpose', () => {
                // # Go to test channel
                cy.visit(`/${testTeam.name}/channels/${testChannel.name}`);

                // # Click on the channel info button
                cy.get('#channel-info-btn').click();

                cy.apiPatchChannel(testChannel.id, {
                    ...testChannel,
                    purpose: 'purpose for the tests',
                }).then(() => {
                    cy.uiGetRHS().findByText('purpose for the tests').should('be.visible');
                });
            });
            it('should display description', () => {
                // # Go to test channel
                cy.visit(`/${testTeam.name}/channels/${testChannel.name}`);

                // # Click on the channel info button
                cy.get('#channel-info-btn').click();

                cy.apiPatchChannel(testChannel.id, {
                    ...testChannel,
                    header: 'description for the tests',
                }).then(() => {
                    cy.uiGetRHS().findByText('description for the tests').should('be.visible');
                });
            });
        });
        describe('bottom menu', () => {
            it('should be able to manage notifications', () => {
                // # Go to test channel
                cy.visit(`/${testTeam.name}/channels/${testChannel.name}`);

                // # Click on the channel info button
                cy.get('#channel-info-btn').click();

                // # Click on "Notification Preferences"
                cy.uiGetRHS().findByText('Notification Preferences').should('be.visible').click();

                // * Ensures the modal is there
                cy.get('.settings-modal').should('be.visible');
            });
        });
    });

    describe('group channel', () => {
        describe('top buttons', () => {
            it('should be able to toggle favorite', () => {
                // # Go to test channel
                cy.visit(`/${testTeam.name}/messages/${groupChannel.name}`);

                // # Click on the channel info button
                cy.get('#channel-info-btn').click();

                // * Verify that we can toggle the favorite status
                cy.uiGetRHS().findByText('Favorite').should('be.visible').click();
                cy.uiGetRHS().findByText('Favorited').should('be.visible').click();
                cy.uiGetRHS().findByText('Favorite').should('be.visible');
            });

            it('should be able to toggle mute', () => {
                // # Go to test channel
                cy.visit(`/${testTeam.name}/messages/${groupChannel.name}`);

                // # Click on the channel info button
                cy.get('#channel-info-btn').click();

                // * Verify that we can toggle the mute status
                cy.uiGetRHS().findByText('Mute').should('be.visible').click();
                cy.uiGetRHS().findByText('Muted').should('be.visible').click();
                cy.uiGetRHS().findByText('Mute').should('be.visible');
            });

            it('should be able to add people', () => {
                // # Go to test channel
                cy.visit(`/${testTeam.name}/messages/${groupChannel.name}`);

                // # Click on the channel info button
                cy.get('#channel-info-btn').click();

                // * Verify that the modal appears
                cy.uiGetRHS().findByText('Add People').should('be.visible').click();
                cy.get('.more-direct-channels').should('be.visible');
            });

            it('should NOT be able to copy link', () => {
                // # Go to test channel
                cy.visit(`/${testTeam.name}/messages/${groupChannel.name}`);

                // # Click on the channel info button
                cy.get('#channel-info-btn').click();

                // # Click on "Copy Link"
                cy.uiGetRHS().get('Copy Link').should('not.exist');
            });
        });
        describe('about area', () => {
            it('should display purpose', () => {
                // # Go to test channel
                cy.visit(`/${testTeam.name}/channels/${testChannel.name}`);

                // # Click on the channel info button
                cy.get('#channel-info-btn').click();

                cy.apiPatchChannel(testChannel.id, {
                    ...testChannel,
                    purpose: 'purpose for the tests',
                }).then(() => {
                    cy.uiGetRHS().findByText('purpose for the tests').should('be.visible');
                });
            });
            it('should display description', () => {
                // # Go to test channel
                cy.visit(`/${testTeam.name}/channels/${testChannel.name}`);

                // # Click on the channel info button
                cy.get('#channel-info-btn').click();

                cy.apiPatchChannel(testChannel.id, {
                    ...testChannel,
                    header: 'description for the tests',
                }).then(() => {
                    cy.uiGetRHS().findByText('description for the tests').should('be.visible');
                });
            });
        });

        describe('bottom menu', () => {
            it('should be able to manage notifications', () => {
                // # Go to test channel
                cy.visit(`/${testTeam.name}/channels/${testChannel.name}`);

                // # Click on the channel info button
                cy.get('#channel-info-btn').click();

                // # Click on "Notification Preferences"
                cy.uiGetRHS().findByText('Notification Preferences').should('be.visible').click();

                // * Ensures the modal is there
                cy.get('.settings-modal').should('be.visible');
            });
        });
    });

    describe('direct channel', () => {
        describe('top buttons', () => {
            it('should be able to toggle favorite', () => {
                // # Go to test channel
                cy.visit(`/${testTeam.name}/messages/@${directUser.username}`);

                // # Click on the channel info button
                cy.get('#channel-info-btn').click();

                // * Verify that we can toggle the favorite status
                cy.uiGetRHS().findByText('Favorite').should('be.visible').click();
                cy.uiGetRHS().findByText('Favorited').should('be.visible').click();
                cy.uiGetRHS().findByText('Favorite').should('be.visible');
            });

            it('should be able to toggle mute', () => {
                // # Go to test channel
                cy.visit(`/${testTeam.name}/messages/@${directUser.username}`);

                // # Click on the channel info button
                cy.get('#channel-info-btn').click();

                // * Verify that we can toggle the mute status
                cy.uiGetRHS().findByText('Mute').should('be.visible').click();
                cy.uiGetRHS().findByText('Muted').should('be.visible').click();
                cy.uiGetRHS().findByText('Mute').should('be.visible');
            });

            it('should NOT be able to add people', () => {
                // # Go to test channel
                cy.visit(`/${testTeam.name}/messages/@${directUser.username}`);

                // # Click on the channel info button
                cy.get('#channel-info-btn').click();

                // * Verify that the modal appears
                cy.uiGetRHS().findByText('Add People').should('not.exist');
            });

            it('should NOT be able to copy link', () => {
                // # Go to test channel
                cy.visit(`/${testTeam.name}/messages/@${directUser.username}`);

                // # Click on the channel info button
                cy.get('#channel-info-btn').click();

                // # Click on "Copy Link"
                cy.uiGetRHS().get('Copy Link').should('not.exist');
            });
        });
    });
});
