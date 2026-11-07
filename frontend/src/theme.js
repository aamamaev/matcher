import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    primary: { main: "#0B6E4F" },
    background: { default: "#F4F6F5", paper: "#FFFFFF" },
    text: { primary: "#1C1B1F", secondary: "#49454F" },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: "Roboto, sans-serif",
    h4: { fontWeight: 500, letterSpacing: 0 },
    button: { textTransform: "none", fontWeight: 500 },
  },
});
