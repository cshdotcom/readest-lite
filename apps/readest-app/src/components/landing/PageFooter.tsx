'use client';

import React from 'react';

interface PageFooterProps {
  tagline: string;
}

export const PageFooter: React.FC<PageFooterProps> = ({ tagline }) => (
  <p className='text-base-content/50 mt-6 text-center text-xs'>
    <a
      href='https://cshdotcom.github.io/readestl/'
      className='hover:text-base-content/80 font-medium transition-colors'
      target='_blank'
      rel='noopener'
    >
      Readest{' '}
      <span className='bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 bg-clip-text text-transparent font-bold'>
        Lite
      </span>
    </a>
    <span className='mx-1.5'>·</span>
    <span>{tagline}</span>
  </p>
);
