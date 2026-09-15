import unittest
from worker import box
class Coordinates(unittest.TestCase):
 def test_bottom_left_pdf_coordinates_are_flipped(self):
  self.assertEqual(box({'l':10,'t':700,'r':50,'b':680,'coord_origin':'BOTTOMLEFT'},800),{'x':10,'y':100,'width':40,'height':20})
 def test_top_left_coordinates_are_retained(self):
  self.assertEqual(box({'l':10,'t':100,'r':50,'b':120,'coord_origin':'TOPLEFT'},800),{'x':10,'y':100,'width':40,'height':20})
if __name__=='__main__':unittest.main()
