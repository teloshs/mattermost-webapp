// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useCallback, useEffect} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {RouteComponentProps} from 'react-router';
import {CSSTransition} from 'react-transition-group';
import {FormattedMessage} from 'react-intl';

import {savePreferences} from 'mattermost-redux/actions/preferences';
import {createChannel} from 'mattermost-redux/actions/channels';
import {ActionResult} from 'mattermost-redux/types/actions';
import {Team} from 'mattermost-redux/types/teams';
import {Channel} from 'mattermost-redux/types/channels';
import {sendEmailInvitesToTeamGracefully} from 'mattermost-redux/actions/teams';
import {GlobalState} from 'mattermost-redux/types/store';
import {get} from 'mattermost-redux/selectors/entities/preferences';
import {getCurrentUser} from 'mattermost-redux/selectors/entities/common';
import {Client4} from 'mattermost-redux/client';

import {isFirstAdmin} from 'components/next_steps_view/steps';

import './fullscreen_wizard.scss';

import Constants, {OnboardingPreferences} from 'utils/constants';
import {makeNewEmptyChannel} from 'utils/channel_utils';
import {teamNameToUrl} from 'utils/url';
import {makeNewTeam} from 'utils/team_utils';

import {getLicense} from 'mattermost-redux/selectors/entities/general';

import {WizardSteps, WizardStep, Animations, AnimationReason, Form, emptyForm} from './steps';

import ChannelComponent from './channel';
import ChannelsPreview from './channels_preview';
import InviteMembers from './invite_members';
import Organization from './organization';
import Plugins from './plugins';
import Progress from './progress';
import Url from './url';
import UseCase from './use_case';

const SubmissionStates = {
    Presubmit: 'Presubmit',
    UserRequested: 'UserRequested',
    Submitting: 'Submitting',
    SubmitSuccess: 'SubmitSuccess',
    SubmitFail: 'SubmitFail',
} as const;

type SubmissionState = typeof SubmissionStates[keyof typeof SubmissionStates];

const DISPLAY_SUCCESS_TIME = 3000;

export type Actions = {
    createTeam: (team: Team) => ActionResult;
    checkIfTeamExists: (teamName: string) => ActionResult;
}

type Props = {
    handleForm(form: Form): void;
    background?: JSX.Element | string;
    actions: Actions;
}

export default function FullscreenWizard(props: Props & RouteComponentProps) {
    const user = useSelector(getCurrentUser);

    // const getState = useSelector(x => () => x);
    const isUserFirstAdmin = useSelector(isFirstAdmin);

    const isSelfHosted = useSelector(getLicense).Cloud !== 'true';

    const stepOrder = [
        isSelfHosted && WizardSteps.Organization,
        isSelfHosted && WizardSteps.Url,
        WizardSteps.UseCase,
        WizardSteps.Plugins,
        WizardSteps.Channel,
        WizardSteps.InviteMembers,
        WizardSteps.TransitioningOut,
    ].filter((x) => Boolean(x)) as WizardStep[];

    const existingUseCasePreference = useSelector((state: GlobalState) => get(state, Constants.Preferences.ONBOARDING, OnboardingPreferences.USE_CASE, false));
    const shouldShowSetup = props.location.pathname.includes('/setup');
    const [currentStep, setCurrentStep] = useState<WizardStep>(stepOrder[0]);
    const [mostRecentStep, setMostRecentStep] = useState<WizardStep>(stepOrder[0]);
    const [submissionState, setSubmissionState] = useState<SubmissionState>(SubmissionStates.Presubmit);
    const [form, setForm] = useState(emptyForm);
    const dispatch = useDispatch();
    const makeNext = useCallback((currentStep: WizardStep) => {
        return function innerMakeNext() {
            const stepIndex = stepOrder.indexOf(currentStep);
            if (stepIndex === -1 || stepIndex >= stepOrder.length) {
                return;
            }
            setCurrentStep(stepOrder[stepIndex + 1]);

            setMostRecentStep(currentStep);
        };
    }, []);

    const sendForm = async () => {
        setSubmissionState(SubmissionStates.Presubmit);
        dispatch(savePreferences(user.id, [
            {
                category: Constants.Preferences.ONBOARDING,
                name: OnboardingPreferences.USE_CASE,
                user_id: user.id,
                value: JSON.stringify(form.useCase),
            },
        ]));

        // send plugins
        const {skipped: skippedPlugins, ...pluginChoices} = form.plugins;
        if (!skippedPlugins) {
            const pluginsToSetup = Object.entries(pluginChoices).reduce(
                (acc: string[], [k, v]): string[] => (v ? [...acc, k] : acc), [],
            );
            const completeSetupRequest = {
                plugins: pluginsToSetup,
            };
            try {
                await Client4.completeSetup(completeSetupRequest);
            } catch (e) {
                // TODO:
                // uh oh. show error to user?
                // maybe a toast on the main screen?
                console.error(`error setting up plugins ${e}`);
            }
        }

        // TODO: fix types here, destructuring as necessary et cetera
        // eslint-disable-next-line
        const {data: team} = await props.actions.createTeam(makeNewTeam(form.organization, teamNameToUrl(form.organization || '').url));

        let redirectChannel: Channel | null = null;
        if (!form.channel.skipped) {
            const {data: channel, error} = dispatch(createChannel(makeNewEmptyChannel(form.channel.name, team.id), user.id)) as ActionResult;
            redirectChannel = channel;
            if (error) {
                // TODO: Ruh Roah. Show some error?
            }

            // send them to the channel they just created instead of town square?
        }

        if (!form.teamMembers.skipped) {
            // invite to team/channels gracefully
            // TODO: Does on prem have a team at this point? May need to insert the team from creation on a prior screen.
            dispatch(sendEmailInvitesToTeamGracefully(team.id, form.teamMembers.invites));
        }

        setSubmissionState(SubmissionStates.SubmitSuccess);

        setTimeout(() => {
            makeNext(WizardSteps.InviteMembers)();

            setTimeout(() => {
                props.history.push(`${team.name}/channels/${redirectChannel?.name || ''}`);
            }, 12345);
        }, DISPLAY_SUCCESS_TIME);

        // i.e. TransitioningOut
    };

    useEffect(() => {
        if (submissionState !== SubmissionStates.UserRequested) {
            return;
        }
        sendForm();
    }, [submissionState]);

    if (!isUserFirstAdmin) {
        // TODO: Redirect user here.
        throw new Error('user is not first admin');
    }

    // means the first admin has come back to this route after already having filled it out
    if (Boolean(existingUseCasePreference) && submissionState === SubmissionStates.Presubmit) {
        // TODO Redirect user here.
    }

    const getTransitionDirection = (step: WizardStep): AnimationReason => {
        const stepIndex = stepOrder.indexOf(step);
        const currentStepIndex = stepOrder.indexOf(currentStep);
        const mostRecentStepIndex = stepOrder.indexOf(mostRecentStep);
        if (stepIndex === -1 || currentStepIndex === -1 || mostRecentStepIndex === -1) {
            return Animations.Reasons.EnterFromBefore;
        }
        if (currentStep === step) {
            return currentStepIndex > mostRecentStepIndex ? Animations.Reasons.EnterFromBefore : Animations.Reasons.EnterFromAfter;
        }
        return stepIndex > mostRecentStepIndex ? Animations.Reasons.ExitToBefore : Animations.Reasons.ExitToAfter;
    };

    const getTransitionDirectionMultiStep = (steps: WizardStep[]): AnimationReason => {
        if (steps.length === 0) {
            return Animations.Reasons.EnterFromBefore;
        }
        const stepIndexes = steps.map((step) => stepOrder.indexOf(step));
        stepIndexes.sort();
        const [stepIndexesMin, stepIndexesMax] = [stepIndexes[0], stepIndexes.length - 1];
        const currentStepIndex = stepOrder.indexOf(currentStep);
        const mostRecentStepIndex = stepOrder.indexOf(mostRecentStep);
        if (steps.length === 0 || stepIndexes.some((step) => step === -1) || currentStepIndex === -1 || mostRecentStepIndex === -1) {
            return Animations.Reasons.EnterFromBefore;
        }
        if (currentStepIndex >= stepIndexesMin && currentStepIndex <= stepIndexesMax) {
            return currentStepIndex > mostRecentStepIndex ? Animations.Reasons.EnterFromBefore : Animations.Reasons.EnterFromAfter;
        }
        return stepIndexesMax > mostRecentStepIndex ? Animations.Reasons.ExitToBefore : Animations.Reasons.ExitToAfter;
    };
    const goPrevious = useCallback(() => {
        if (submissionState !== SubmissionStates.Presubmit) {
            return;
        }
        const stepIndex = stepOrder.indexOf(currentStep);
        if (stepIndex <= 0) {
            return;
        }
        setCurrentStep(stepOrder[stepIndex - 1]);
    }, [currentStep]);
    const skipPlugins = useCallback((skipped: boolean) => {
        if (skipped === form.plugins.skipped) {
            return;
        }
        setForm({
            ...form,
            plugins: {
                ...form.plugins,
                skipped,
            },
        });
    }, [form]);
    const skipChannel = useCallback((skipped: boolean) => {
        if (skipped === form.channel.skipped) {
            return;
        }
        setForm({
            ...form,
            channel: {
                ...form.channel,
                skipped,
            },
        });
    }, [form]);
    const skipTeamMembers = useCallback((skipped: boolean) => {
        if (skipped === form.teamMembers.skipped) {
            return;
        }
        setForm({
            ...form,
            teamMembers: {
                ...form.teamMembers,
                skipped,
            },
        });
    }, [form]);

    const previous = (<div onClick={goPrevious}>
        {'^ '}
        <FormattedMessage
            id={'onboarding_wizard.previous'}
            defaultMessage='Previous'
        />
    </div>);

    // TODO: figure out why CSSTransition isn't working for this top level route.
    return (
        <CSSTransition
            classNames='FullscreenWizard'
            in={shouldShowSetup}
            enter={true}
            exit={true}
            mountOnEnter={true}
            unmountOnExit={true}
            timeout={{
                appear: 200,
                enter: 200,
                exit: 5000,
            }}
        >
            <div className='fullscreen-wizard-container'>
                {props.background}
                <div className='FullscreenWizard__logo'>
                    {'mattermost logo'}
                </div>
                <Progress
                    step={currentStep}
                    stepOrder={stepOrder}
                    transitionSpeed={Animations.PAGE_SLIDE}
                />
                <div className='fullscreen-page-container'>
                    {isSelfHosted && <Organization
                        show={currentStep === WizardSteps.Organization}
                        next={makeNext(WizardSteps.Organization)}
                        direction={getTransitionDirection(WizardSteps.Organization)}
                        organization={form.organization || ''}
                        setOrganization={(organization: Form['organization']) => {
                            setForm({
                                ...form,
                                organization,
                            });
                        }}
                    />}
                    {isSelfHosted && <Url
                        previous={previous}
                        show={currentStep === WizardSteps.Url}
                        next={makeNext(WizardSteps.Url)}
                        direction={getTransitionDirection(WizardSteps.Url)}
                        url={form.url || ''}
                        setUrl={(url: Form['url']) => {
                            setForm({
                                ...form,
                                url,
                            });
                        }}
                    />}
                    <UseCase
                        previous={isSelfHosted ? previous : undefined}
                        options={form.useCase}
                        setOption={(option: keyof Form['useCase']) => {
                            setForm({
                                ...form,
                                useCase: {
                                    ...form.useCase,
                                    [option]: !form.useCase[option],
                                },
                            });
                        }}
                        show={currentStep === WizardSteps.UseCase}
                        next={makeNext(WizardSteps.UseCase)}
                        direction={getTransitionDirection(WizardSteps.UseCase)}
                    />
                    <Plugins
                        next={() => {
                            makeNext(WizardSteps.Plugins)();
                            skipPlugins(false);
                        }}
                        skip={() => {
                            makeNext(WizardSteps.Plugins)();
                            skipPlugins(true);
                        }}
                        options={form.plugins}
                        setOption={(option: keyof Form['plugins']) => {
                            setForm({
                                ...form,
                                plugins: {
                                    ...form.plugins,
                                    [option]: !form.plugins[option],
                                },
                            });
                        }}
                        previous={previous}
                        show={currentStep === WizardSteps.Plugins}
                        direction={getTransitionDirection(WizardSteps.Plugins)}
                    />
                    <ChannelComponent
                        next={() => {
                            makeNext(WizardSteps.Channel)();
                            skipChannel(false);
                        }}
                        skip={() => {
                            makeNext(WizardSteps.Channel)();
                            skipChannel(true);
                        }}
                        previous={previous}
                        show={currentStep === WizardSteps.Channel}
                        direction={getTransitionDirection(WizardSteps.Channel)}
                        name={form.channel.name}
                        onChange={(newValue: string) => setForm({
                            ...form,
                            channel: {
                                ...form.channel,
                                name: newValue,
                            },
                        })}
                    />
                    <InviteMembers
                        next={() => {
                            skipTeamMembers(false);
                            setSubmissionState(SubmissionStates.UserRequested);
                        }}
                        skip={() => {
                            skipTeamMembers(true);
                            setSubmissionState(SubmissionStates.UserRequested);
                        }}
                        previous={previous}
                        show={currentStep === WizardSteps.InviteMembers}
                        direction={getTransitionDirection(WizardSteps.InviteMembers)}
                        disableEdits={submissionState !== SubmissionStates.Presubmit}
                        showInviteSuccess={submissionState === SubmissionStates.SubmitSuccess}
                    />
                    <ChannelsPreview
                        show={currentStep === WizardSteps.Channel || currentStep === WizardSteps.InviteMembers}
                        step={currentStep}
                        direction={getTransitionDirectionMultiStep([WizardSteps.Channel, WizardSteps.InviteMembers])}
                        channelName={form.channel.name}
                        teamName={'form.teamName'}
                    />
                </div>
            </div>
        </CSSTransition>
    );
}
