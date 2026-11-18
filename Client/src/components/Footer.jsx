const Footer = () => {
  return (
    <footer className="bg-gray-800 p-10 mt-8 ">
  <div className="container mx-auto text-gray-400 flex justify-between items-center">
    <p>&copy; {new Date().getFullYear()} FinAI. All rights reserved.</p>
    <a href="https://github.com/R1ch3rd/FinAL" className="hover:text-white">Contact Us</a>
  </div>
</footer>

  );
};

export default Footer;
