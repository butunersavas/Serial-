import { createTheme } from '@mui/material/styles';

export const severityColors = {
  Acil: '#dc2626',
  Kritik: '#b91c1c',
  Yüksek: '#f97316',
  Orta: '#eab308',
  Düşük: '#16a34a',
};

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0f2f57',
      dark: '#071d36',
      light: '#1f5a95',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#2563eb',
    },
    error: {
      main: '#dc2626',
    },
    warning: {
      main: '#f97316',
    },
    success: {
      main: '#16a34a',
      light: '#dcfce7',
    },
    background: {
      default: '#eef3f8',
      paper: '#ffffff',
    },
    text: {
      primary: '#102033',
      secondary: '#607087',
    },
  },
  shape: {
    borderRadius: 14,
  },
  typography: {
    fontFamily: ['Inter', 'Roboto', 'Arial', 'sans-serif'].join(','),
    h5: {
      fontWeight: 800,
    },
    h6: {
      fontWeight: 800,
    },
    button: {
      fontWeight: 700,
      textTransform: 'none',
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: 'linear-gradient(90deg, #071d36 0%, #0f2f57 48%, #164f84 100%)',
          boxShadow: '0 10px 28px rgba(7, 29, 54, 0.22)',
        },
      },
    },
    MuiCard: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          border: '1px solid rgba(15, 47, 87, 0.08)',
          boxShadow: '0 14px 36px rgba(15, 47, 87, 0.08)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
});

export default theme;
