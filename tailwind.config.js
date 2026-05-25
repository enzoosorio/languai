/** @type {import('tailwindcss').Config} */
// Decisiones: crafting/DESIGN_SYSTEM.md
module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Sage — el color ambiental del blob. SOLO usar como blob fill.
        sage: {
          50:  '#F5F4EF',
          100: '#EDECD9',   // #E9EBD6 — el sage del Figma
          200: '#D8DAB8',
          300: '#C3C699',
          400: '#A8AC72',
          500: '#8A9060',
          600: '#6E7449',
          700: '#545547',   // badge gradient bottom
          800: '#3A3D32',
          900: '#0C0D0B',   // dark background
        },
        // Terracota — acento cálido, danger
        terra: {
          300: 'rgba(180,100,60,0.6)',
          500: 'rgba(125,46,17,0.9)',
          700: 'rgba(85,35,12,0.95)',
        },
        // Olive — accent
        olive: {
          400: '#9AAB28',
          500: '#747E12',
          600: '#5C7048',
          700: '#4A5C38',
        },
      },
      fontFamily: {
        // Darker Grotesque — nav, captions
        grotesque:        ['DarkerGrotesque_400Regular'],
        // Plus Jakarta Sans — display, logo
        jakarta:          ['PlusJakartaSans_200ExtraLight'],
        'jakarta-regular':['PlusJakartaSans_400Regular'],
        // Bricolage Grotesque — body, fine
        bricolage:        ['BricolageGrotesque_400Regular'],
        'bricolage-light':['BricolageGrotesque_300Light'],
      },
      fontSize: {
        // Escala tipográfica canónica (ver DESIGN_SYSTEM.md § 3)
        'display': ['48px', { lineHeight: '52px', letterSpacing: '-0.05em' }],  // -5%
        'logo':    ['36px', { lineHeight: '40px', letterSpacing: '-0.025em' }], // -2.5%
        'nav':     ['24px', { lineHeight: '28px', letterSpacing: '0'       }],
        'body':    ['20px', { lineHeight: '28px', letterSpacing: '0'       }],
        'caption': ['16px', { lineHeight: '20px', letterSpacing: '0.02em'  }],  // +2%
        'fine':    ['16px', { lineHeight: '24px', letterSpacing: '0'       }],
      },
      borderRadius: {
        // Shape language (ver DESIGN_SYSTEM.md § 5)
        'xs':     '8px',
        'sm':     '12px',
        'md':     '16px',
        'lg':     '24px',
        'card':   '32px',
        'pill':   '60px',
        'blob':   '77px',
        'circle': '9999px',
      },
      backdropBlur: {
        'ghost':  '12px',
        'soft':   '16px',
        'strong': '27px',
      },
    },
  },
  plugins: [],
};
