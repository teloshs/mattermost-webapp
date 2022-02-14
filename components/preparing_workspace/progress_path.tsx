// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import PageLine from './page_line';
import './progress_path.scss';

type Props = {
    children: React.ReactNode | React.ReactNodeArray;
}
export default (props: Props) => (
    <div className='ProgressPath'>
        <PageLine
            style={{
                height: '50vh',
                position: 'absolute',
                transform: 'translateY(-100%)',
                top: '-20px',
            }}
            noLeft={true}
        />
        {props.children}
        <PageLine
            style={{
                height: '50vh',
                    // position: 'absolute',
                    // transform: 'translateY(0)',
                top: '20px',
            }}
            noLeft={true}
        />
    </div>
);
